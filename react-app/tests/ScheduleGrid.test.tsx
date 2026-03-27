import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ScheduleGrid from "../src/components/ScheduleGrid";
import { Channel, EpgData } from "../src/types";

describe("ScheduleGrid", () => {
  const mockChannels: Channel[] = [
    {
      id: "1",
      name: "Channel 1",
      epg_id: "1",
      logo: "logo1.png",
      url: "https://example.com/stream1",
      category: "New Zealand",
    },
  ];

  const mockEpg: EpgData = new Map([
    [
      "1",
      [
        {
          title: "Show 1",
          startMs: Date.now(),
          stopMs: Date.now() + 3_600_000,
          start: new Date(),
          stop: new Date(Date.now() + 3_600_000),
          channelId: "1",
          description: "Show 1 Description",
        },
      ],
    ],
  ]);

  const defaultProps = {
    scrollTop: 0,
    clientHeight: 500,
    channels: mockChannels,
    epg: mockEpg,
    pixelsPerHour: 100,
    scheduleStartTime: new Date(),
    nowLineOffset: 50,
    onProgrammeSelect: vi.fn(),
  };

  it("should render channel headers", () => {
    render(<ScheduleGrid {...defaultProps} />);
    expect(screen.getByAltText("Channel 1 logo")).toBeDefined();
  });

  it("should render program blocks", () => {
    render(<ScheduleGrid {...defaultProps} />);
    expect(screen.getByText("Show 1")).toBeDefined();
  });

  it('should render the "now" line', () => {
    const { container } = render(<ScheduleGrid {...defaultProps} />);
    const nowLine = container.querySelector('div[role="presentation"]');
    expect(nowLine).toBeDefined();
    expect((nowLine as HTMLElement).style.top).toBe("50px");
  });
});
