import { describe, it, expect } from "vitest";
import { findCurrentProgrammeIndex } from "../src/utils/programmeUtils";
import type { Programme } from "../src/types";

const HOUR = 3_600_000;

function makeProg(startMs: number, durationMs: number, title = "Test"): Programme {
  return {
    channelId: "test",
    start: new Date(startMs),
    stop: new Date(startMs + durationMs),
    startMs,
    stopMs: startMs + durationMs,
    title,
    description: "",
  };
}

describe("findCurrentProgrammeIndex", () => {
  it("returns -1 for undefined programmes", () => {
    expect(findCurrentProgrammeIndex()).toBe(-1);
  });

  it("returns -1 for an empty array", () => {
    expect(findCurrentProgrammeIndex([])).toBe(-1);
  });

  it("finds a single programme that is currently airing", () => {
    const now = 1_000_000;
    const progs = [makeProg(now - 30_000, 60_000)]; // started 30s ago, ends in 30s
    expect(findCurrentProgrammeIndex(progs, new Date(now))).toBe(0);
  });

  it("returns -1 when time is before all programmes", () => {
    const now = 1_000_000;
    const progs = [makeProg(now + 10_000, HOUR)]; // starts 10s from now
    expect(findCurrentProgrammeIndex(progs, new Date(now))).toBe(-1);
  });

  it("returns -1 when time is after all programmes", () => {
    const now = 1_000_000;
    const progs = [makeProg(now - 2 * HOUR, HOUR)]; // ended 1 hour ago
    expect(findCurrentProgrammeIndex(progs, new Date(now))).toBe(-1);
  });

  it("finds the correct index with multiple programmes via binary search", () => {
    const base = 1_000_000;
    const progs = [
      makeProg(base - 3 * HOUR, HOUR), // index 0: ended 2h ago
      makeProg(base - 2 * HOUR, HOUR), // index 1: ended 1h ago
      makeProg(base - 30 * 60_000, HOUR), // index 2: started 30m ago, ends in 30m ← current
      makeProg(base + 30 * 60_000, HOUR), // index 3: starts in 30m
    ];
    expect(findCurrentProgrammeIndex(progs, new Date(base))).toBe(2);
  });

  it("finds the first programme in the list (index 0)", () => {
    const base = 1_000_000;
    const progs = [
      makeProg(base - 30_000, HOUR), // index 0: currently airing ← current
      makeProg(base + HOUR - 30_000, HOUR), // index 1: future
    ];
    expect(findCurrentProgrammeIndex(progs, new Date(base))).toBe(0);
  });

  it("finds the last programme in the list", () => {
    const base = 1_000_000;
    const progs = [
      makeProg(base - 3 * HOUR, HOUR), // index 0: past
      makeProg(base - 2 * HOUR, HOUR), // index 1: past
      makeProg(base - 30 * 60_000, HOUR), // index 2: currently airing ← current
    ];
    expect(findCurrentProgrammeIndex(progs, new Date(base))).toBe(2);
  });

  it("treats stopMs as exclusive — not current at exactly stopMs", () => {
    const base = 1_000_000;
    const progs = [makeProg(base, 60_000)]; // stops at base + 60_000
    expect(findCurrentProgrammeIndex(progs, new Date(base + 60_000))).toBe(-1);
  });

  it("includes the programme when time equals exactly startMs (inclusive lower bound)", () => {
    const base = 1_000_000;
    const progs = [makeProg(base, 60_000)];
    expect(findCurrentProgrammeIndex(progs, new Date(base))).toBe(0);
  });

  it("returns -1 when time falls in a gap between two programmes", () => {
    const base = 1_000_000;
    const progs = [
      makeProg(base - 2 * HOUR, HOUR), // ends at base - 1h
      makeProg(base + HOUR, HOUR), // starts at base + 1h
    ];
    // base is in the gap between the two programmes
    expect(findCurrentProgrammeIndex(progs, new Date(base))).toBe(-1);
  });

  it("uses the current time by default when no `now` argument is provided", () => {
    const realNow = Date.now();
    const progs = [makeProg(realNow - 30_000, 60_000)];
    // Should find index 0 since the programme is airing right now
    expect(findCurrentProgrammeIndex(progs)).toBe(0);
  });
});
