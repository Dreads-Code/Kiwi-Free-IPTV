import { useState, useCallback, useEffect } from "react";
import type { RefObject } from "react";

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

export function useFullscreen(
  containerRef: RefObject<HTMLDivElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCastAvailable, setIsCastAvailable] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull) {
        try {
          screen.orientation.unlock();
        } catch {
          // Ignore errors
        }
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    const handleWebKitCastAvailability = (event: Event) => {
      const availabilityEvent = event as WebKitPlaybackTargetAvailabilityEvent;
      setIsCastAvailable(availabilityEvent.availability === "available");
    };

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
        handleWebKitCastAvailability,
      );
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      video.removeEventListener(
        "webkitplaybacktargetavailabilitychanged",
        handleWebKitCastAvailability,
      );
    };
  }, [videoRef]);

  const handleFullscreenToggle = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
        try {
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
    setIsFullscreen(!!document.fullscreenElement);
  }, [containerRef]);

  const handleCast = useCallback(() => {
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
  }, [videoRef, isCastAvailable]);

  return { isFullscreen, handleFullscreenToggle, isCastAvailable, handleCast };
}
