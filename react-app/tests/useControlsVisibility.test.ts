import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useControlsVisibility } from "../src/hooks/useControlsVisibility";

describe("useControlsVisibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start with controls visible", () => {
    const { result } = renderHook(() => useControlsVisibility(false));
    expect(result.current.isControlsVisible).toBe(true);
  });

  it("showControls() keeps controls visible", () => {
    const { result } = renderHook(() => useControlsVisibility(false));
    act(() => {
      result.current.showControls();
    });
    expect(result.current.isControlsVisible).toBe(true);
  });

  it("auto-hides controls after 3 seconds when playing", () => {
    const { result } = renderHook(() => useControlsVisibility(true));

    act(() => {
      result.current.showControls();
    });
    expect(result.current.isControlsVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.isControlsVisible).toBe(false);
  });

  it("does NOT auto-hide controls when not playing", () => {
    const { result } = renderHook(() => useControlsVisibility(false));

    act(() => {
      result.current.showControls();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.isControlsVisible).toBe(true);
  });

  it("cancelAutoHide() keeps controls visible and prevents the timer from hiding them", () => {
    const { result } = renderHook(() => useControlsVisibility(true));

    act(() => {
      result.current.showControls();
    });
    act(() => {
      result.current.cancelAutoHide();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.isControlsVisible).toBe(true);
  });

  it("calling showControls() a second time resets the 3s timer", () => {
    const { result } = renderHook(() => useControlsVisibility(true));

    act(() => {
      result.current.showControls(); // timer starts
    });
    act(() => {
      vi.advanceTimersByTime(2000); // 2s in — not hidden yet
    });
    act(() => {
      result.current.showControls(); // resets timer; new deadline is 3s from now
    });
    act(() => {
      vi.advanceTimersByTime(2999); // 2.999s after reset — still visible
    });
    expect(result.current.isControlsVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2); // 3.001s after reset — timer fires
    });
    expect(result.current.isControlsVisible).toBe(false);
  });

  it("respects isPlaying ref: does not hide if paused before the timer fires", () => {
    const { result, rerender } = renderHook(
      ({ isPlaying }) => useControlsVisibility(isPlaying),
      { initialProps: { isPlaying: true } },
    );

    act(() => {
      result.current.showControls(); // timer will hide in 3s
    });

    // Switch to paused before the timer fires
    rerender({ isPlaying: false });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // isPlayingRef.current is now false — controls must stay visible
    expect(result.current.isControlsVisible).toBe(true);
  });
});
