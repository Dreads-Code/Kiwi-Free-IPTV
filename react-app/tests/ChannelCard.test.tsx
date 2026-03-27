/**
 * Unit tests for the DeckChannelCard component.
 * Validates rendering of channel/programme info and user interactions.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DeckChannelCard from "../src/components/ChannelCard";
import { Channel, Programme } from "../src/types";

// Mock the hook
vi.mock("../src/hooks/useShowImage", () => ({
  useProgramImage: vi.fn(() => ({
    posterUrl: "https://example.com/poster.jpg",
  })),
}));

describe("ChannelCard", () => {
  const mockChannel: Channel = {
    id: "nz-tv1",
    name: "TVNZ 1",
    logo: "https://example.com/logo.png",
    url: "https://example.com/stream.m3u8",
    epg_id: "nz-tv1",
    category: "New Zealand",
  };

  const mockProgrammes: Programme[] = [
    {
      channelId: "nz-tv1",
      start: new Date(Date.now() - 1_800_000), // 30 mins ago
      stop: new Date(Date.now() + 1_800_000), // 30 mins from now
      startMs: Date.now() - 1_800_000,
      stopMs: Date.now() + 1_800_000,
      title: "Current Show",
      description: "Test Desc",
      isNew: true,
    },
  ];

  it("should render the channel name and logo correctly", () => {
    render(
      <DeckChannelCard
        channel={mockChannel}
        programmes={mockProgrammes}
        onSelect={vi.fn()}
        isActive={false}
      />,
    );

    expect(screen.getByText("TVNZ 1")).toBeDefined();
    expect(screen.getByText("Current Show")).toBeDefined();
    expect(screen.getByAltText("Current Show")).toBeDefined();
  });

  it("should call the onClick handler when clicked", () => {
    const onSelect = vi.fn();
    render(
      <DeckChannelCard
        channel={mockChannel}
        programmes={mockProgrammes}
        onSelect={onSelect}
        isActive={false}
      />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(mockChannel.id);
  });

  it("should show an active state/styling if the channel is selected", () => {
    render(
      <DeckChannelCard
        channel={mockChannel}
        programmes={mockProgrammes}
        onSelect={vi.fn()}
        isActive={true}
      />,
    );

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.className).toContain("scale-105");
  });

  it('should show "NEW" badge if current programme is new', () => {
    render(
      <DeckChannelCard
        channel={mockChannel}
        programmes={mockProgrammes}
        onSelect={vi.fn()}
        isActive={false}
      />,
    );

    expect(screen.getByText("NEW")).toBeDefined();
  });

  it('should handle missing programmes gracefully (fallback to "Live")', () => {
    render(
      <DeckChannelCard
        channel={mockChannel}
        programmes={[]}
        onSelect={vi.fn()}
        isActive={false}
      />,
    );

    expect(screen.getByText("Live")).toBeDefined();
  });
});
