import { describe, it, expect } from "vitest";
import { formatTime } from "../src/utils/formatTime";

describe("formatTime", () => {
  it("formats seconds into MM:SS", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(59)).toBe("00:59");
    expect(formatTime(60)).toBe("01:00");
    expect(formatTime(601)).toBe("10:01");
  });

  it("formats seconds into HH:MM:SS", () => {
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(3661)).toBe("1:01:01");
    expect(formatTime(36_000)).toBe("10:00:00");
  });

  it("handles NaN by returning 00:00", () => {
    expect(formatTime(Number.NaN)).toBe("00:00");
  });

  it("handles negative values by returning 00:00", () => {
    expect(formatTime(-1)).toBe("00:00");
    expect(formatTime(-100)).toBe("00:00");
  });

  it("should floor decimal values", () => {
    expect(formatTime(60.9)).toBe("01:00");
    expect(formatTime(1.5)).toBe("00:01");
  });
});
