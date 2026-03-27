import { useRef, useState, useCallback, useEffect } from "react";

export function useControlsVisibility(isPlaying: boolean) {
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const controlsTimeoutRef = useRef<number | null>(null);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const showControls = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) {
      globalThis.clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = globalThis.setTimeout(() => {
      if (isPlayingRef.current) {
        setIsControlsVisible(false);
      }
    }, 3000) as unknown as number;
  }, []);

  const cancelAutoHide = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) {
      globalThis.clearTimeout(controlsTimeoutRef.current);
    }
  }, []);

  return { isControlsVisible, showControls, cancelAutoHide };
}
