import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HeroModal from "../src/components/HeroModal";
import { Channel, Programme } from "../src/types";

// Mock hook
vi.mock("../src/hooks/useShowImage", () => ({
  useProgramImage: vi.fn(() => ({
    posterUrl: "https://example.com/poster.jpg",
  })),
}));

describe("HeroModal", () => {
  const mockChannel: Channel = {
    id: "1",
    name: "Test Channel",
    logo: "https://example.com/logo.png",
    url: "https://example.com/stream",
    epg_id: "1",
    category: "New Zealand",
  };

  const mockProgramme: Programme = {
    title: "Hero Programme",
    description: "Hero Description",
    start: new Date("2024-01-01T12:00:00Z"),
    stop: new Date("2024-01-01T13:00:00Z"),
    startMs: new Date("2024-01-01T12:00:00Z").getTime(),
    stopMs: new Date("2024-01-01T13:00:00Z").getTime(),
    channelId: "1",
    rating: "PG",
    categories: ["Action"],
  };

  const defaultProps = {
    config: {
      programme: mockProgramme,
      channel: mockChannel,
      context: "live" as const,
    },
    onClose: vi.fn(),
    onPlay: vi.fn(),
    onOpenSchedule: vi.fn(),
    epg: new Map(),
  };

  it("should display the programme details correctly", () => {
    render(<HeroModal {...defaultProps} />);

    expect(screen.getByText("Hero Programme")).toBeDefined();
    expect(screen.getByText("Hero Description")).toBeDefined();
    expect(screen.getByText("PG")).toBeDefined();
    expect(screen.getByText("Action")).toBeDefined();
  });

  it("should trigger onPlay when Play button clicked", () => {
    render(<HeroModal {...defaultProps} />);
    const playButton = screen.getByText("Watch Now");
    fireEvent.click(playButton);
    expect(defaultProps.onPlay).toHaveBeenCalledWith(mockChannel.url);
  });

  it("should trigger onClose when close button clicked", () => {
    render(<HeroModal {...defaultProps} />);
    const closeButton = screen.getByLabelText("Close details");
    fireEvent.click(closeButton);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("should trigger onOpenSchedule when Full Schedule clicked", () => {
    render(<HeroModal {...defaultProps} />);
    const scheduleButton = screen.getByText("Full Schedule");
    fireEvent.click(scheduleButton);
    expect(defaultProps.onOpenSchedule).toHaveBeenCalled();
  });
});
