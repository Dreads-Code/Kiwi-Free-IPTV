import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";

import { Channel, EpgData, Programme } from "../types";
import { useProgramImage } from "../hooks/useShowImage";
import CustomVideoControls from "./CustomVideoControls";
import {
  applyProxyRules,
  isProxiedUrl,
  decodeProxyUrl,
  resolveStreamUrl,
  isHighConfidenceDirect,
} from "../services/streamProxyService";

// Minimal HLS Type Definitions to avoid 'any'
interface HlsLevel {
  height: number;
  bitrate: number;
}

interface HlsSubtitleTrack {
  lang?: string;
  name?: string;
}

interface HlsSubtitleTracksUpdatedData {
  subtitleTracks: HlsSubtitleTrack[];
}

interface HlsInstance {
  destroy(): void;
  loadSource(url: string): void;
  attachMedia(video: HTMLVideoElement): void;
  on(event: string, callback: (event: string, data: unknown) => void): void;
  subtitleTrack: number;
  currentLevel: number;
  levels: HlsLevel[];
  startLoad(): void;
  recoverMediaError(): void;
}

interface HlsStatic {
  new (config?: Record<string, unknown>): HlsInstance;
  isSupported(): boolean;
  Events: {
    MANIFEST_PARSED: string;
    MANIFEST_LOADED: string;
    SUBTITLE_TRACKS_UPDATED: string;
    ERROR: string;
  };
  ErrorTypes: {
    NETWORK_ERROR: string;
    MEDIA_ERROR: string;
    OTHER_ERROR: string;
  };
}

declare const Hls: HlsStatic;

/**
 * Extended HTMLVideoElement to support experimental Remote Playback (Casting) APIs
 * as seen in modern browsers like Chrome and Safari.
 */
interface RemotePlayback extends EventTarget {
  watchAvailability(callback: (available: boolean) => void): Promise<number>;
  cancelWatchAvailability(id?: number): Promise<void>;
  prompt(): Promise<void>;
  state: "connecting" | "connected" | "disconnected";
}

type HTMLVideoElementExtended = HTMLVideoElement & {
  remote?: RemotePlayback;
  webkitShowPlaybackTargetPicker?: () => void;
};

interface WebKitPlaybackTargetAvailabilityEvent extends Event {
  availability: "available" | "not-available";
}

const findCurrentProgrammeIndex = (
  programmes: Programme[] | undefined,
): number => {
  if (!programmes || programmes.length === 0) return -1;
  const now = new Date();
  return programmes.findIndex((p) => now >= p.start && now < p.stop);
};

const NextUpCard = ({
  programme,
  channel,
}: {
  programme: Programme;
  channel: Channel;
}) => {
  const { posterUrl } = useProgramImage(programme, channel);
  if (!posterUrl) return null;
  return (
    <div className="animate-slide-in-up flex w-64 items-center overflow-hidden rounded-lg border border-white/10 bg-slate-900/80 p-3 shadow-2xl backdrop-blur-md">
      <img
        src={posterUrl}
        alt={programme.title}
        className="h-24 w-16 shrink-0 rounded-md object-cover"
      />
      <div className="ml-3 overflow-hidden">
        <p className="text-xs text-gray-300">Next Up</p>
        <p className="line-clamp-3 text-sm leading-tight font-bold text-white">
          {programme.title}
        </p>
      </div>
    </div>
  );
};

interface VideoPlayerProps {
  streamUrl: string;
  onClose: () => void;
  channel: Channel;
  epg: EpgData;
}

const VideoPlayer = ({
  streamUrl,
  onClose,
  channel,
  epg,
}: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const effectiveStreamUrlRef = useRef<string>(streamUrl);
  const retryCountRef = useRef<number>(0);
  const MAX_RETRIES = 2;

  useEffect(() => {
    effectiveStreamUrlRef.current = streamUrl;
  }, [streamUrl]);

  const headersRef = useRef(channel.headers);
  useEffect(() => {
    headersRef.current = channel.headers;
  }, [channel.headers]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCastAvailable, setIsCastAvailable] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "error" | "info";
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const url = await resolveStreamUrl(streamUrl, channel.headers);
      if (!cancelled) {
        setResolvedUrl(url);
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [streamUrl, channel.headers]);

  // Subtitle and Quality state
  const [subtitleTracks, setSubtitleTracks] = useState<
    { id: number; label: string }[]
  >([]);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1);
  const [qualities, setQualities] = useState<
    { id: number; height: number; bitrate: number }[]
  >([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [isPipAvailable] = useState(
    () => typeof document !== "undefined" && document.pictureInPictureEnabled,
  );

  const { currentProgramme, nextProgramme } = useMemo(() => {
    const programmes = epg.get(channel.epg_id);
    const currentIndex = findCurrentProgrammeIndex(programmes);
    if (currentIndex === -1 || !programmes) {
      return { currentProgramme: null, nextProgramme: null };
    }
    return {
      currentProgramme: programmes[currentIndex],
      nextProgramme: programmes[currentIndex + 1] || null,
    };
  }, [channel.epg_id, epg]);

  const [showNextUp, setShowNextUp] = useState(false);
  const [prevProgramme, setPrevProgramme] = useState(currentProgramme);

  if (currentProgramme !== prevProgramme) {
    setPrevProgramme(currentProgramme);
    setShowNextUp(false);
  }

  // Toast Auto-hide
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // HLS Logic
  const handleManifestParsed = useCallback(() => {
    // Defensive: wrap in requestAnimationFrame to avoid potential synchronous layout thrashing
    // from immediate playback or state updates during the manifest parsed event.
    requestAnimationFrame(() => {
      if (videoRef.current) {
        videoRef.current.play().catch((error: unknown) => {
          const err = error as Error;
          if (err.name === "AbortError") return;
          console.error("[VideoPlayer] Play failed", error);
        });
      }

      // Get qualities
      const levels = hlsRef.current?.levels.map((level, index) => ({
        height: level.height,
        bitrate: level.bitrate,
        id: index,
      }));
      if (levels) {
        setQualities(levels);
      }

      // Explicitly turn off subtitles by default
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
    });
  }, []);

  const xhrSetup = useCallback(
    (xhr: XMLHttpRequest, url: string) => {
      // Only listen for headers on playlist requests to avoid spam/errors on segments
      if (url.includes(".m3u8")) {
        // Update effective URL to handle relative path resolution for future chunks
        const onReadyStateChange = () => {
          if (xhr.readyState === 4) {
            let newEffectiveUrl: string | null;

            // Try to decode the URL from our own established proxy format first (Rust proxy)
            const decoded = decodeProxyUrl(xhr.responseURL || url);
            if (decoded) {
              newEffectiveUrl = decoded;
            } else {
              // Fallback: check legacy header or direct responseURL
              try {
                // Only try to read custom headers if it's our proxy to avoid "unsafe header" warnings
                newEffectiveUrl = isProxiedUrl(xhr.responseURL || url)
                  ? (xhr.getResponseHeader("X-Final-Url") ?? xhr.responseURL)
                  : xhr.responseURL;
              } catch {
                newEffectiveUrl = xhr.responseURL;
              }
            }

            if (
              newEffectiveUrl &&
              effectiveStreamUrlRef.current !== newEffectiveUrl
            ) {
              effectiveStreamUrlRef.current = newEffectiveUrl;
            }
            xhr.removeEventListener("readystatechange", onReadyStateChange);
          }
        };
        xhr.addEventListener("readystatechange", onReadyStateChange);
      }

      // Since the Rust server rewrites manifests to use absolute proxy URLs,
      // Hls.js will resolve future tracks against those proxy URLs automatically.
      // We only need to intercept if it somehow escapes the proxy (e.g. legacy logic
      // or edge cases where Hls.js falls back to local origin).
      if (isProxiedUrl(url)) return;

      const isLocalOrigin = url.startsWith(globalThis.location.origin);
      if (isLocalOrigin) {
        // ... (existing resolution logic is fine as a safety net)
        try {
          const urlObj = new URL(url);
          const unwrapped =
            decodeProxyUrl(effectiveStreamUrlRef.current) ??
            effectiveStreamUrlRef.current;

          const streamBaseUrl = unwrapped.slice(
            0,
            unwrapped.lastIndexOf("/") + 1,
          );
          const pathToResolve = urlObj.pathname.startsWith("/api/")
            ? urlObj.pathname.slice(5)
            : urlObj.pathname.slice(1);
          const upstreamUrl = new URL(pathToResolve, streamBaseUrl).toString();

          xhr.open(
            "GET",
            applyProxyRules(upstreamUrl, headersRef.current),
            true,
          );
        } catch {
          /* ignore */
        }
      }
    },
    [headersRef],
  );

  const handleHlsErrorRef =
    useRef<(_event: string, data: unknown) => void>(null);

  const handleRetry = useCallback(
    (
      failedUrl: string,
      onHlsError: (_event: string, data: unknown) => void,
    ) => {
      const video = videoRef.current;
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        hlsRef.current?.destroy();

        setTimeout(() => {
          if (Hls.isSupported() && video) {
            const retryHls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              backBufferLength: 90,
              xhrSetup: xhrSetup,
            });
            hlsRef.current = retryHls;
            retryHls.loadSource(resolvedUrl || streamUrl);
            retryHls.attachMedia(video);
            retryHls.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
            retryHls.on(Hls.Events.ERROR, onHlsError);
          }
        }, 500);
        return true;
      }
      return false;
    },
    [xhrSetup, resolvedUrl, streamUrl, handleManifestParsed],
  );

  const handleProxyFallback = useCallback(
    (
      failedUrl: string,
      onHlsError: (_event: string, data: unknown) => void,
    ) => {
      const video = videoRef.current;
      hlsRef.current?.destroy();
      const proxyUrl = applyProxyRules(failedUrl, channel.headers);

      if (Hls.isSupported() && video) {
        const newHls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          xhrSetup: xhrSetup,
        });
        hlsRef.current = newHls;
        newHls.loadSource(proxyUrl);
        newHls.attachMedia(video);

        newHls.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
        newHls.on(Hls.Events.ERROR, (evt: string, errData: unknown) => {
          const fatalError = errData as { fatal: boolean };
          if (fatalError.fatal) {
            hlsRef.current?.destroy();
            setToast({
              message: "Proxy connection failed. Please try again later.",
              type: "error",
            });
            onHlsError(evt, errData);
          }
        });
      }
    },
    [xhrSetup, handleManifestParsed, channel.headers],
  );

  const handleHlsError = useCallback(
    (_event: string, data: unknown) => {
      const errorData = data as {
        fatal: boolean;
        type: string;
        details: string;
        url?: string;
      };

      if (
        errorData.details === "bufferStalledError" ||
        errorData.details === "bufferSeekOverHole"
      ) {
        return;
      }

      const hls = hlsRef.current;
      const isNetworkError = errorData.type === Hls.ErrorTypes.NETWORK_ERROR;
      const isManifestOrLevelError =
        errorData.details === "manifestLoadError" ||
        errorData.details === "levelLoadError" ||
        errorData.details === "audioTrackLoadError" ||
        errorData.details === "fragParsingError" ||
        errorData.details === "bufferAppendError";

      const isProxied = isProxiedUrl(errorData.url ?? streamUrl);
      const isHighConfidence = isHighConfidenceDirect(
        errorData.url ?? streamUrl,
      );

      const isRecoverable =
        (errorData.fatal &&
          isNetworkError &&
          isManifestOrLevelError &&
          !isProxied) ||
        (errorData.type === Hls.ErrorTypes.MEDIA_ERROR && !isProxied);

      if (!isRecoverable) {
        console.error("[VideoPlayer] HLS Error:", errorData);
      }

      if (!errorData.fatal) return;

      const failedUrl = errorData.url ?? streamUrl;

      // Automated Retries
      if (isNetworkError && isManifestOrLevelError && !isProxied) {
        // Pass a wrapper to handleRetry to avoid circular ref in dependencies
        const errorHandler = (e: string, d: unknown) =>
          handleHlsErrorRef.current?.(e, d);
        if (handleRetry(failedUrl, errorHandler)) return;
      }

      // Proxy Fallback
      if (isRecoverable) {
        if (isHighConfidence) {
          hls?.destroy();
          setToast({
            message:
              "Stream unavailable in your region. Please try again later.",
            type: "error",
          });
          return;
        }
        const errorHandler = (e: string, d: unknown) =>
          handleHlsErrorRef.current?.(e, d);
        handleProxyFallback(failedUrl, errorHandler);
        return;
      }

      // Recovery Logic
      if (errorData.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls?.startLoad();
      } else if (errorData.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls?.recoverMediaError();
      } else {
        hls?.destroy();
        setToast({
          message: "Playback error. Please try again later.",
          type: "error",
        });
      }
    },
    [streamUrl, handleRetry, handleProxyFallback],
  );

  // Use a second effect to keep the ref in sync without triggering handleHlsError re-creation
  useEffect(() => {
    handleHlsErrorRef.current = handleHlsError;
  }, [handleHlsError]);

  useEffect(() => {
    if (!videoRef.current || !resolvedUrl) return;
    const video = videoRef.current;
    let hls: HlsInstance | null = null;

    const urlToPlay = resolvedUrl;
    effectiveStreamUrlRef.current = streamUrl;

    const isHls =
      streamUrl.toLowerCase().includes(".m3u8") ||
      urlToPlay.toLowerCase().includes(".m3u8");

    if (isHls) {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          xhrSetup: xhrSetup,
        });
        hlsRef.current = hls;

        // Load the (potentially browser-resolved) URL.
        hls.loadSource(urlToPlay);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          handleManifestParsed();
        });

        hls.on(Hls.Events.ERROR, handleHlsError);

        hls.on(
          Hls.Events.SUBTITLE_TRACKS_UPDATED,
          (_event: string, data: unknown) => {
            const subtitleData = data as HlsSubtitleTracksUpdatedData;
            const tracks = subtitleData.subtitleTracks.map((track, index) => ({
              id: index,
              label:
                track.name ?? track.lang ?? `Track ${(index + 1).toString()}`,
            }));
            setSubtitleTracks(tracks);
          },
        );
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Native HLS fallback (iPhone/Safari)
        video.src = urlToPlay;
        video.addEventListener("loadedmetadata", handleManifestParsed);

        const handleTracksChanged = () => {
          const tracks = [...video.textTracks].map(
            (track: TextTrack, index: number) => ({
              id: index,
              label:
                track.label ||
                track.language ||
                `Track ${(index + 1).toString()}`,
            }),
          );
          setSubtitleTracks(tracks);
        };
        video.textTracks.addEventListener("addtrack", handleTracksChanged);
        video.textTracks.addEventListener("removetrack", handleTracksChanged);
        handleTracksChanged();
      }
    } else {
      // Non-HLS
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", handleManifestParsed);
    }

    return () => {
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [streamUrl, resolvedUrl, xhrSetup, handleManifestParsed, handleHlsError]);

  const showControls = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = globalThis.setTimeout(() => {
      if (isPlaying) setIsControlsVisible(false);
    }, 3000) as unknown as number;
  }, [isPlaying]);

  // Player event listeners
  useEffect(() => {
    const video = videoRef.current;
    const container = playerContainerRef.current;
    if (!video || !container) return;

    const updatePlayState = () => {
      setIsPlaying(!video.paused);
    };
    const updateTime = () => {
      setCurrentTime(video.currentTime);
    };
    const updateDuration = () => {
      setDuration(video.duration);
    };
    const handleWaiting = () => {
      setIsBuffering(true);
    };
    const handlePlaying = () => {
      setIsBuffering(false);
    };

    video.setAttribute("x-webkit-airplay", "allow");

    video.addEventListener("play", updatePlayState);
    video.addEventListener("pause", updatePlayState);
    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("durationchange", updateDuration);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    container.addEventListener("mousemove", showControls);
    container.addEventListener("click", showControls);
    container.addEventListener("touchstart", showControls, { passive: true });

    return () => {
      video.removeEventListener("play", updatePlayState);
      video.removeEventListener("pause", updatePlayState);
      video.removeEventListener("timeupdate", updateTime);
      video.removeEventListener("durationchange", updateDuration);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      container.removeEventListener("mousemove", showControls);
      container.removeEventListener("click", showControls);
      container.removeEventListener("touchstart", showControls);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [showControls]);

  // Fullscreen and Cast API listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      // Unlock orientation on exit
      if (!isFull) {
        try {
          screen.orientation.unlock();
        } catch {
          // Ignore errors
        }
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    const checkCastAvailability = () => {
      const videoElement = video as HTMLVideoElementExtended;

      const remote = (videoElement as unknown as { remote?: RemotePlayback })
        .remote;
      if (remote && typeof remote.watchAvailability === "function") {
        remote
          .watchAvailability((available) => {
            setIsCastAvailable(available);
          })
          .catch(() => {
            setIsCastAvailable(false);
          });
      } else if ("WebKitPlaybackTargetAvailabilityEvent" in globalThis) {
        video.addEventListener(
          "webkitplaybacktargetavailabilitychanged",
          (event: Event) => {
            const availabilityEvent =
              event as WebKitPlaybackTargetAvailabilityEvent;
            setIsCastAvailable(availabilityEvent.availability === "available");
          },
        );
      }
    };
    checkCastAvailability();

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleFullscreenToggle = useCallback(async () => {
    const container = playerContainerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        // Note: handleFullscreenChange will handle unlock
      } else {
        await container.requestFullscreen();
        // Try to lock orientation to landscape
        try {
          // Cast to unknown then to specific type to avoid 'any' if needed,
          // but most modern browsers support .lock on screen.orientation.
          const orientation = screen.orientation as unknown as {
            lock: (type: string) => Promise<void>;
          };
          if (typeof orientation.lock === "function") {
            await orientation.lock("landscape");
          }
        } catch (error) {
          console.info(
            "[VideoPlayer] Orientation lock failed (expected on some devices/browsers):",
            error,
          );
        }
      }
    } catch (error) {
      console.error("[VideoPlayer] Fullscreen toggle failed", error);
    }
    // State update will be caught by the event listener, but manual update just in case
    setIsFullscreen(!!document.fullscreenElement);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      switch (e.key.toLowerCase()) {
        case " ": {
          e.preventDefault();
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
          break;
        }
        case "m": {
          video.muted = !video.muted;
          break;
        }
        case "f": {
          void handleFullscreenToggle();
          break;
        }
        case "arrowright": {
          video.currentTime += 10;
          break;
        }
        case "arrowleft": {
          video.currentTime -= 10;
          break;
        }
        case "arrowup": {
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        }
        case "arrowdown": {
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleFullscreenToggle]);

  // Next Up card logic
  useEffect(() => {
    if (!currentProgramme) {
      return;
    }

    let showTimeout: ReturnType<typeof setTimeout> | null = null;
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextUp = () => {
      const now = Date.now();
      const endTime = currentProgramme.stop.getTime();
      const showTime = endTime - 60_000;

      // 1. Initial State
      setShowNextUp(now >= showTime && now < endTime);

      // 2. Schedule Show
      if (showTime > now) {
        showTimeout = setTimeout(() => {
          setShowNextUp(true);
        }, showTime - now);
      }

      // 3. Schedule Hide
      if (endTime > now) {
        hideTimeout = setTimeout(() => {
          setShowNextUp(false);
        }, endTime - now);
      }
    };

    scheduleNextUp();

    return () => {
      if (showTimeout) clearTimeout(showTimeout);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [currentProgramme]);

  const handlePlayPause = useCallback(() => {
    if (videoRef.current?.paused) {
      videoRef.current.play();
    } else {
      videoRef.current?.pause();
    }
  }, []);

  const handleMuteToggle = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
    setIsMuted((m) => !m);
  };

  const handleVolumeChange = (newVolume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
    }
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time;
  };

  const handleCast = () => {
    const video = videoRef.current;
    if (!video) return;

    const videoElement = video as HTMLVideoElementExtended;

    const remote = (videoElement as unknown as { remote?: RemotePlayback })
      .remote;
    if (isCastAvailable && remote && typeof remote.prompt === "function") {
      remote.prompt().catch((error: unknown) => {
        console.error("Cast prompt failed:", error);
      });
    } else if (
      typeof videoElement.webkitShowPlaybackTargetPicker === "function"
    ) {
      videoElement.webkitShowPlaybackTargetPicker();
    }
  };

  const handleSubtitleChange = (trackId: number) => {
    setCurrentSubtitleTrack(trackId);
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = trackId;
    } else if (videoRef.current) {
      for (const [index, track] of [...videoRef.current.textTracks].entries()) {
        track.mode = index === trackId ? "showing" : "hidden";
      }
    }
  };

  const handleQualityChange = (qualityId: number) => {
    setCurrentQuality(qualityId);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = qualityId;
    }
  };

  const handlePipToggle = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      const action = document.pictureInPictureElement
        ? document.exitPictureInPicture()
        : videoRef.current.requestPictureInPicture();
      await action;
    } catch (error: unknown) {
      console.error("PiP toggle failed:", error);
    }
  }, []);

  if (!resolvedUrl) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-rounded animate-spin text-4xl text-(--md-sys-color-primary)">
            refresh
          </span>
          <p className="text-sm font-medium text-white/60">
            Resolving stream...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={playerContainerRef}
      className="animate-fade-in group fixed inset-0 z-50 bg-black"
      role="dialog"
      aria-modal="true"
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        autoPlay
        playsInline
        muted={isMuted}
      >
        <track kind="captions" />
      </video>

      {isBuffering && isPlaying && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="h-16 w-16 animate-spin rounded-full border-t-2 border-b-2 border-white/80"></div>
        </div>
      )}

      <CustomVideoControls
        isVisible={isControlsVisible}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        volume={volume}
        isMuted={isMuted}
        onVolumeChange={handleVolumeChange}
        onMuteToggle={handleMuteToggle}
        currentTime={currentTime}
        duration={duration}
        onSeek={handleSeek}
        isFullscreen={isFullscreen}
        onFullscreenToggle={() => {
          handleFullscreenToggle();
        }}
        isCastAvailable={isCastAvailable}
        onCast={handleCast}
        channelName={channel.name}
        programmeTitle={currentProgramme?.title ?? "Live Stream"}
        subtitleTracks={subtitleTracks}
        currentSubtitleTrack={currentSubtitleTrack}
        onSubtitleChange={handleSubtitleChange}
        qualities={qualities}
        currentQuality={currentQuality}
        onQualityChange={handleQualityChange}
        isPipAvailable={isPipAvailable}
        onPipToggle={() => {
          handlePipToggle();
        }}
      />

      <button
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation(); // Prevent toggling controls when clicking close
          onClose();
        }}
        className={`absolute top-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-3xl font-bold text-white/80 backdrop-blur-sm transition-opacity hover:bg-black/80 hover:text-white ${isControlsVisible ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"}`}
        aria-label="Close player"
      >
        &times;
      </button>

      {toast && (
        <div className="animate-slide-in-up fixed bottom-12 left-1/2 z-[60] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/80 px-6 py-4 shadow-2xl backdrop-blur-xl">
            <div
              className={`h-2.5 w-2.5 rounded-full ${toast?.type === "error" ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"}`}
            />
            <p className="text-sm font-medium text-white/90">
              {toast?.message}
            </p>
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-white/40 hover:text-white"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {showNextUp && nextProgramme && (
        <div className="pointer-events-none absolute right-8 bottom-24 z-20">
          <NextUpCard programme={nextProgramme} channel={channel} />
        </div>
      )}

      <style>{`
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fade-in 0.3s ease-in-out;
                }
            `}</style>
    </div>
  );
};

export default VideoPlayer;
