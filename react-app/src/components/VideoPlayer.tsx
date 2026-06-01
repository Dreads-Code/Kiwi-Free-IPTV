import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { X, AlertTriangle, Tv, RefreshCw } from "lucide-react";

import { Channel, EpgData } from "../types";
import CustomVideoControls from "./CustomVideoControls";
import NextUpCard from "./NextUpCard";
import { findCurrentProgrammeIndex } from "../utils/programmeUtils";
import { resolveStreamUrl } from "../services/streamProxyService";
import { useHlsPlayer } from "../hooks/useHlsPlayer";
import { useControlsVisibility } from "../hooks/useControlsVisibility";
import { useFullscreen } from "../hooks/useFullscreen";
import { useNextUpCard } from "../hooks/useNextUpCard";

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

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isPipAvailable] = useState(
    () => typeof document !== "undefined" && document.pictureInPictureEnabled,
  );
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      const url = await resolveStreamUrl(streamUrl, channel.headers);
      if (!cancelled) setResolvedUrl(url);
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [streamUrl, channel.headers]);

  const isTvnz2 = useMemo(() => {
    return (
      channel.name.toLowerCase().includes("tvnz 2") ||
      channel.name.toLowerCase().replaceAll(" ", "") === "tvnz2"
    );
  }, [channel.name]);

  // Loading and buffering timeout effect to explain errors gracefully
  useEffect(() => {
    if (isPlaying) {
      return;
    }

    if (isTvnz2) {
      // For TVNZ 2, we know it's a permanent DRM migration, so show message after a brief loading state
      const timer = setTimeout(() => {
        setLoadError(
          "TVNZ 2 has transitioned to encrypted DRM (Widevine) streams. Unencrypted public feeds are currently unavailable. We are actively monitoring for new public mirror streams.",
        );
        setIsBuffering(false);
      }, 5000);
      return () => {
        clearTimeout(timer);
      };
    }

    // General timeout for other channels
    const timer = setTimeout(() => {
      setLoadError(
        "This stream is taking unusually long to load. The source server might be temporarily offline, restricted in your region, or experiencing network CORS blocks.",
      );
      setIsBuffering(false);
    }, 12_000);

    return () => {
      clearTimeout(timer);
    };
  }, [isPlaying, isBuffering, resolvedUrl, isTvnz2]);

  const {
    subtitleTracks,
    currentSubtitleTrack,
    handleSubtitleChange,
    qualities,
    currentQuality,
    handleQualityChange,
    hlsError,
    clearHlsError,
  } = useHlsPlayer({
    videoRef,
    streamUrl,
    resolvedUrl,
    headers: channel.headers,
  });

  // Combine local load timeouts and HlsPlayer errors into a unified user-friendly view
  const activeError = useMemo(() => {
    if (loadError) return loadError;
    if (hlsError) {
      if (hlsError.toLowerCase().includes("proxy connection failed")) {
        return "Connection to the secure proxy failed. The stream link might be offline, restricted in your region, or the upstream CDN is blocking requests.";
      }
      if (
        hlsError.toLowerCase().includes("stream unavailable in your region")
      ) {
        return "This stream is geoblocked or restricted in your region. The source CDN requires a local New Zealand IP address.";
      }
      return hlsError;
    }
    return null;
  }, [loadError, hlsError]);

  const handleRetry = useCallback(() => {
    setLoadError(null);
    clearHlsError();
    setIsBuffering(true);
    const currentResolved = resolvedUrl;
    setResolvedUrl(null);
    setTimeout(() => {
      setResolvedUrl(currentResolved);
    }, 150);
  }, [clearHlsError, resolvedUrl]);

  const { isControlsVisible, showControls, cancelAutoHide } =
    useControlsVisibility(isPlaying);

  const { isFullscreen, handleFullscreenToggle, isCastAvailable, handleCast } =
    useFullscreen(playerContainerRef, videoRef);

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

  const showNextUp = useNextUpCard(currentProgramme);

  // Sync isPlaying state with video element events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleActualPlay = () => {
      setIsPlaying(true);
      setLoadError(null);
      showControls();
    };
    const handleActualPause = () => {
      setIsPlaying(false);
      cancelAutoHide();
    };
    video.addEventListener("play", handleActualPlay);
    video.addEventListener("pause", handleActualPause);
    video.addEventListener("playing", handleActualPlay);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (!video.paused) {
      timeoutId = setTimeout(() => {
        handleActualPlay();
      }, 0);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      video.removeEventListener("play", handleActualPlay);
      video.removeEventListener("pause", handleActualPause);
      video.removeEventListener("playing", handleActualPlay);
    };
  }, [showControls, cancelAutoHide]);

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
          if (video.paused) video.play().catch(console.error);
          else video.pause();
          break;
        }
        case "m": {
          video.muted = !video.muted;
          break;
        }
        case "f": {
          handleFullscreenToggle().catch(console.error);
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

  const handleSeek = (time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time;
  };

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Play failed:", error);
        }
      });
    } else {
      video.pause();
    }
  }, []);

  const handleMuteToggle = () => {
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
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

  return (
    <div
      ref={playerContainerRef}
      className="animate-fade-in group fixed inset-0 z-50 bg-black"
      role="dialog"
      aria-modal="true"
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      <video
        ref={videoRef}
        className="pointer-events-none h-full w-full object-contain"
        autoPlay
        playsInline
        muted={isMuted}
        onPlay={() => {
          setIsPlaying(true);
          showControls();
        }}
        onPause={() => {
          setIsPlaying(false);
          cancelAutoHide();
        }}
        onPlaying={() => {
          setIsPlaying(true);
          setIsBuffering(false);
          showControls();
        }}
        onWaiting={() => {
          setIsBuffering(true);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onDurationChange={(e) => {
          setDuration(e.currentTarget.duration);
        }}
      >
        <track kind="captions" />
      </video>

      {/* Interaction overlay — captures play/pause clicks and resets auto-hide timer */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          handlePlayPause();
          showControls();
        }}
      />

      {activeError ? (
        <div className="animate-fade-in absolute inset-0 z-30 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="flex w-full max-w-md flex-col items-center rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.15)]">
              {isTvnz2 ? (
                <Tv size={28} className="animate-pulse" />
              ) : (
                <AlertTriangle size={28} className="animate-pulse" />
              )}
            </div>
            <h3 className="mb-2 text-xl font-bold tracking-wide text-white">
              {isTvnz2 ? "DRM Encrypted Channel" : "Playback Error"}
            </h3>
            <p className="mb-6 text-sm leading-relaxed text-white/70">
              {activeError}
            </p>
            <div className="flex w-full gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="flex-1 cursor-pointer rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white active:scale-95"
              >
                Close Channel
              </button>
              {!isTvnz2 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetry();
                  }}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-black shadow-lg shadow-white/5 transition-all hover:bg-white/90 active:scale-95"
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        (!resolvedUrl || isBuffering) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white/80"></div>
          </div>
        )
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
          handleFullscreenToggle().catch(console.error);
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
          handlePipToggle().catch(console.error);
        }}
      />

      <button
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onClose();
        }}
        className={`absolute top-4 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/80 hover:text-white ${isControlsVisible ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"}`}
        aria-label="Close player"
      >
        <X size={24} />
      </button>

      {hlsError && (
        <div className="animate-slide-in-up fixed bottom-12 left-1/2 z-[60] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/80 px-6 py-4 shadow-2xl backdrop-blur-xl">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
            <p className="text-sm font-medium text-white/90">{hlsError}</p>
            <button
              onClick={clearHlsError}
              className="ml-2 flex h-6 w-6 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
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
