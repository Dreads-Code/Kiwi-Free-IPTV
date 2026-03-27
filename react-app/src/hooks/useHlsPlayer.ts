import { useRef, useEffect, useCallback, useState } from "react";
import type { RefObject } from "react";
import {
  applyProxyRules,
  isProxiedUrl,
  decodeProxyUrl,
  isHighConfidenceDirect,
} from "../services/streamProxyService";

// Minimal HLS Type Definitions
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

export interface HlsInstance {
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

const MAX_RETRIES = 2;

interface UseHlsPlayerParams {
  videoRef: RefObject<HTMLVideoElement | null>;
  streamUrl: string;
  resolvedUrl: string | null;
  headers: Record<string, string> | undefined;
}

export function useHlsPlayer({
  videoRef,
  streamUrl,
  resolvedUrl,
  headers,
}: UseHlsPlayerParams) {
  const hlsRef = useRef<HlsInstance | null>(null);
  const effectiveStreamUrlRef = useRef<string>(streamUrl);
  const retryCountRef = useRef<number>(0);
  const headersRef = useRef(headers);
  const handleHlsErrorRef = useRef<
    ((_event: string, data: unknown) => void) | null
  >(null);

  const [subtitleTracks, setSubtitleTracks] = useState<
    { id: number; label: string }[]
  >([]);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1);
  const [qualities, setQualities] = useState<
    { id: number; height: number; bitrate: number }[]
  >([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [hlsError, setHlsError] = useState<string | null>(null);

  useEffect(() => {
    effectiveStreamUrlRef.current = streamUrl;
  }, [streamUrl]);

  useEffect(() => {
    headersRef.current = headers;
  }, [headers]);

  const handleManifestParsed = useCallback(() => {
    requestAnimationFrame(() => {
      if (videoRef.current) {
        videoRef.current.play().catch((error: unknown) => {
          const err = error as Error;
          if (err.name === "AbortError") return;
          console.error("[VideoPlayer] Play failed", error);
        });
      }
      const levels = hlsRef.current?.levels.map((level, index) => ({
        height: level.height,
        bitrate: level.bitrate,
        id: index,
      }));
      if (levels) setQualities(levels);
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
    });
  }, [videoRef]);

  const xhrSetup = useCallback((xhr: XMLHttpRequest, url: string) => {
    if (url.includes(".m3u8")) {
      const onReadyStateChange = () => {
        if (xhr.readyState === 4) {
          let newEffectiveUrl: string | null;
          const decoded = decodeProxyUrl(xhr.responseURL || url);
          if (decoded) {
            newEffectiveUrl = decoded;
          } else {
            try {
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

    if (isProxiedUrl(url)) return;

    const isLocalOrigin = url.startsWith(globalThis.location.origin);
    if (isLocalOrigin) {
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
        xhr.open("GET", applyProxyRules(upstreamUrl, headersRef.current), true);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleRetry = useCallback(
    (
      _failedUrl: string,
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
              xhrSetup,
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
    [videoRef, xhrSetup, resolvedUrl, streamUrl, handleManifestParsed],
  );

  const handleProxyFallback = useCallback(
    (
      failedUrl: string,
      onHlsError: (_event: string, data: unknown) => void,
    ) => {
      const video = videoRef.current;
      hlsRef.current?.destroy();
      const proxyUrl = applyProxyRules(failedUrl, headersRef.current);
      if (Hls.isSupported() && video) {
        const newHls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          xhrSetup,
        });
        hlsRef.current = newHls;
        newHls.loadSource(proxyUrl);
        newHls.attachMedia(video);
        newHls.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
        newHls.on(Hls.Events.ERROR, (evt: string, errData: unknown) => {
          const fatalError = errData as { fatal: boolean };
          if (fatalError.fatal) {
            hlsRef.current?.destroy();
            setHlsError("Proxy connection failed. Please try again later.");
            onHlsError(evt, errData);
          }
        });
      }
    },
    [videoRef, xhrSetup, handleManifestParsed],
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

      if (isNetworkError && isManifestOrLevelError && !isProxied) {
        const errorHandler = (e: string, d: unknown) =>
          handleHlsErrorRef.current?.(e, d);
        if (handleRetry(failedUrl, errorHandler)) return;
      }

      if (isRecoverable) {
        if (isHighConfidence) {
          hls?.destroy();
          setHlsError(
            "Stream unavailable in your region. Please try again later.",
          );
          return;
        }
        const errorHandler = (e: string, d: unknown) =>
          handleHlsErrorRef.current?.(e, d);
        handleProxyFallback(failedUrl, errorHandler);
        return;
      }

      if (errorData.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls?.startLoad();
      } else if (errorData.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls?.recoverMediaError();
      } else {
        hls?.destroy();
        setHlsError("Playback error. Please try again later.");
      }
    },
    [streamUrl, handleRetry, handleProxyFallback],
  );

  useEffect(() => {
    handleHlsErrorRef.current = handleHlsError;
  }, [handleHlsError]);

  useEffect(() => {
    if (!videoRef.current || !resolvedUrl) return;
    const video = videoRef.current;
    let hls: HlsInstance | null = null;

    effectiveStreamUrlRef.current = streamUrl;
    const isHls =
      streamUrl.toLowerCase().includes(".m3u8") ||
      resolvedUrl.toLowerCase().includes(".m3u8");

    if (isHls) {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          xhrSetup,
        });
        hlsRef.current = hls;
        hls.loadSource(resolvedUrl);
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
        // Native HLS fallback (Safari/iOS)
        video.src = resolvedUrl;
        video.addEventListener("loadedmetadata", handleManifestParsed);

        const handleTracksChanged = () => {
          const textTracks = video.textTracks;
          const tracks = [];
          for (const [i, track] of textTracks.entries()) {
            tracks.push({
              id: i,
              label:
                track.label || track.language || `Track ${(i + 1).toString()}`,
            });
          }
          setSubtitleTracks(tracks);
        };
        video.textTracks.addEventListener("addtrack", handleTracksChanged);
        video.textTracks.addEventListener("removetrack", handleTracksChanged);
        handleTracksChanged();
      }
    } else {
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", handleManifestParsed);
    }

    return () => {
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [
    streamUrl,
    resolvedUrl,
    xhrSetup,
    handleManifestParsed,
    handleHlsError,
    videoRef,
  ]);

  const handleSubtitleChange = useCallback(
    (trackId: number) => {
      setCurrentSubtitleTrack(trackId);
      if (hlsRef.current) {
        hlsRef.current.subtitleTrack = trackId;
      } else if (videoRef.current) {
        const textTracks = videoRef.current.textTracks;
        for (const [i, textTrack] of textTracks.entries()) {
          textTrack.mode = i === trackId ? "showing" : "hidden";
        }
      }
    },
    [videoRef],
  );

  const handleQualityChange = useCallback((qualityId: number) => {
    setCurrentQuality(qualityId);
    if (hlsRef.current) hlsRef.current.currentLevel = qualityId;
  }, []);

  // Auto-dismiss HLS errors after 5 seconds
  useEffect(() => {
    if (hlsError) {
      const timer = setTimeout(() => setHlsError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [hlsError]);

  return {
    hlsRef,
    subtitleTracks,
    currentSubtitleTrack,
    handleSubtitleChange,
    qualities,
    currentQuality,
    handleQualityChange,
    hlsError,
    clearHlsError: () => setHlsError(null),
  };
}
