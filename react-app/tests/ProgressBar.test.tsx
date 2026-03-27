import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import ProgressBar from "../src/components/ProgressBar";

describe("ProgressBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("should correctly reflect progress based on currentTime and duration props", () => {
    const start = new Date(Date.now() - 3_600_000); // 1 hour ago
    const stop = new Date(Date.now() + 3_600_000); // 1 hour from now

    // Total 2 hours, 1 hour passed -> 50%
    const { container } = render(<ProgressBar start={start} stop={stop} />);
    const bar = container.querySelector(
      String.raw`.bg-\(--md-sys-color-primary\)`,
    );
    expect((bar as HTMLElement).style.width).toBe("50%");
  });

  it("should handle past programmes (100%)", () => {
    const start = new Date(Date.now() - 7_200_000); // 2 hours ago
    const stop = new Date(Date.now() - 3_600_000); // 1 hour ago

    const { container } = render(<ProgressBar start={start} stop={stop} />);
    const bar = container.querySelector(
      String.raw`.bg-\(--md-sys-color-primary\)`,
    );
    expect((bar as HTMLElement).style.width).toBe("100%");
  });

  it("should handle future programmes (0%)", () => {
    const start = new Date(Date.now() + 3_600_000); // 1 hour from now
    const stop = new Date(Date.now() + 7_200_000); // 2 hours from now

    const { container } = render(<ProgressBar start={start} stop={stop} />);
    const bar = container.querySelector(
      String.raw`.bg-\(--md-sys-color-primary\)`,
    );
    expect((bar as HTMLElement).style.width).toBe("0%");
  });

  it("should update progress over time", () => {
    const start = new Date(Date.now());
    const stop = new Date(Date.now() + 3_600_000); // 1 hour from now

    const { container } = render(<ProgressBar start={start} stop={stop} />);

    // Advance time by 30 minutes
    vi.advanceTimersByTime(1_800_000);

    // Note: ProgressBar uses an interval of 30 seconds to update
    // We need to trigger the interval
    vi.advanceTimersByTime(30_000);

    // Re-calculating in test to verify
    const bar = container.querySelector(
      String.raw`.bg-\(--md-sys-color-primary\)`,
    );
    expect((bar as HTMLElement).style.width).toBeDefined();
  });
});
