import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ChannelDeck from "../src/components/ChannelList";
import { Channel, EpgData } from "../src/types";

// Mock the dependencies
vi.mock("../src/components/ChannelCard", () => ({
  default: ({ channel, isActive }: { channel: Channel; isActive: boolean }) => (
    <div
      data-testid="channel-card"
      data-channel-id={channel.id}
      data-active={isActive}
    >
      {channel.name}
    </div>
  ),
}));

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe("ChannelList", () => {
  const mockChannels: Channel[] = [
    {
      id: "1",
      name: "Channel 1",
      epg_id: "1",
      logo: "https://example.com/logo1.png",
      url: "https://example.com/stream1.m3u8",
      category: "New Zealand",
    },
    {
      id: "2",
      name: "Channel 2",
      epg_id: "2",
      logo: "https://example.com/logo2.png",
      url: "https://example.com/stream2.m3u8",
      category: "New Zealand",
    },
  ];
  const mockEpg: EpgData = new Map();

  it("should render a list of ChannelCard components based on the provided channels array", () => {
    render(
      <ChannelDeck
        channels={mockChannels}
        epg={mockEpg}
        activeChannelId={null}
        onChannelActivate={vi.fn()}
        onChannelSelect={vi.fn()}
      />,
    );

    const cards = screen.getAllByTestId("channel-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("Channel 1")).toBeDefined();
    expect(screen.getByText("Channel 2")).toBeDefined();
  });

  it("should correctly mark the active channel", () => {
    render(
      <ChannelDeck
        channels={mockChannels}
        epg={mockEpg}
        activeChannelId="2"
        onChannelActivate={vi.fn()}
        onChannelSelect={vi.fn()}
      />,
    );

    const card2 = screen.getByText("Channel 2");
    expect(card2.getAttribute("data-active")).toBe("true");
    const card1 = screen.getByText("Channel 1");
    expect(card1.getAttribute("data-active")).toBe("false");
  });

  it("should display an empty list if no channels are provided", () => {
    render(
      <ChannelDeck
        channels={[]}
        epg={mockEpg}
        activeChannelId={null}
        onChannelActivate={vi.fn()}
        onChannelSelect={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("channel-card")).toBeNull();
  });
});
