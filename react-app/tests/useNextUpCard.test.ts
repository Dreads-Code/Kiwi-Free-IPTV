import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNextUpCard } from "../src/hooks/useNextUpCard";
import type { Programme } from "../src/types";

const createMockProgramme = (
  minutesFromNow: number,
  durationMinutes: number,
): Programme => {
  const now = Date.now();
  const start = new Date(now + (minutesFromNow - durationMinutes) * 60_000);
  const stop = new Date(now + minutesFromNow * 60_000);
  return {
    channelId: "test-channel",
    title: "Test Show",
    description: "Description",
    start,
    stop,
    startMs: start.getTime(),
    stopMs: stop.getTime(),
    icon: undefined,
    categories: [],
    starRating: undefined,
    rating: undefined,
    date: undefined,
  };
};

describe("useNextUpCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should be false if programme ends in 5 minutes", () => {
    const prog = createMockProgramme(5, 30);
    const { result } = renderHook(() => useNextUpCard(prog));
    expect(result.current).toBe(false);
  });

  it("should be true if programme ends in 30 seconds", () => {
    const prog = createMockProgramme(0.5, 30);
    const { result } = renderHook(() => useNextUpCard(prog));
    expect(result.current).toBe(true);
  });

  it("should transition from false to true when time reaches 1 minute before end", () => {
    const prog = createMockProgramme(2, 30);
    const { result } = renderHook(() => useNextUpCard(prog));
    expect(result.current).toBe(false);

    // Advance time by 1 minute (1 minute left until end, so should show card)
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(true);
  });

  it("should transition back to false after programme ends", () => {
    const prog = createMockProgramme(0.5, 30);
    const { result } = renderHook(() => useNextUpCard(prog));
    expect(result.current).toBe(true);

    // Advance time by 31 seconds
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(result.current).toBe(false);
  });
});
