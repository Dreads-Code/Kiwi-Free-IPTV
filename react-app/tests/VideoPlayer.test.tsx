import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
const mockHlsInstance = {
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
};

class MockHls {
  static readonly isSupported = vi.fn(() => true);
  static readonly Events = { MANIFEST_PARSED: "manifestParsed", ERROR: "error" } as const;
  static readonly ErrorTypes = {
    NETWORK_ERROR: "networkError",
    MEDIA_ERROR: "mediaError",
  } as const;
  constructor() {
    return mockHlsInstance as unknown as MockHls;
  }
}

vi.stubGlobal("Hls", MockHls);

import VideoPlayer from "../src/components/VideoPlayer";
import { Channel, EpgData } from "../src/types";
import * as streamProxyService from "../src/services/streamProxyService";

// Mock the proxy service
vi.mock("../src/services/streamProxyService", () => ({
  applyProxyRules: vi.fn((url: string) => `/proxy/${url}`),
  isProxiedUrl: vi.fn(() => false),
  decodeProxyUrl: vi.fn(),
  resolveStreamUrl: vi.fn((url: string) => Promise.resolve(url)),
  isHighConfidenceDirect: vi.fn(() => false),
  needsDirectPlay: vi.fn(() => false),
}));

describe("VideoPlayer", () => {
  const mockChannel: Channel = {
    id: "1",
    name: "Test Channel",
    logo: "https://example.com/logo.png",
    url: "https://example.com/stream.m3u8",
    epg_id: "1",
    category: "New Zealand",
    headers: { "X-Test": "Value" },
  };

  const mockEpg: EpgData = new Map();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    (streamProxyService.resolveStreamUrl as Mock).mockResolvedValue(
      mockChannel.url,
    );
  });

  it("should properly initialize a video element with the provided stream URL", async () => {
    render(
      <VideoPlayer
        streamUrl={mockChannel.url}
        channel={mockChannel}
        epg={mockEpg}
        onClose={vi.fn()}
      />,
    );

    // Check if HLS was initialized
    await waitFor(
      () => {
        expect(mockHlsInstance.loadSource).toHaveBeenCalledWith(
          mockChannel.url,
        );
      },
      { timeout: 3000 },
    );
  });

  it("should handle the URL resolution via resolveStreamUrl before playing", async () => {
    const resolvedUrl = "https://resolved.com/stream.m3u8";
    vi.mocked(streamProxyService.resolveStreamUrl).mockResolvedValueOnce(
      resolvedUrl,
    );

    render(
      <VideoPlayer
        streamUrl={mockChannel.url}
        channel={mockChannel}
        epg={mockEpg}
        onClose={vi.fn()}
      />,
    );

    await waitFor(
      () => {
        expect(mockHlsInstance.loadSource).toHaveBeenCalledWith(resolvedUrl);
      },
      { timeout: 3000 },
    );
  });

  it("should display loading state initially (buffering)", async () => {
    // Mock it to never resolve for this test to catch the loading state
    vi.mocked(streamProxyService.resolveStreamUrl).mockReturnValue(
      new Promise(() => {}),
    );

    render(
      <VideoPlayer
        streamUrl={mockChannel.url}
        channel={mockChannel}
        epg={mockEpg}
        onClose={vi.fn()}
      />,
    );

    // It should show buffering spinner or resolving text
    const loadingText = await screen.findByText(/Resolving/i);
    expect(loadingText).toBeDefined();
  });

  it("should clean up HLS and video state on unmount", async () => {
    const { unmount } = render(
      <VideoPlayer
        streamUrl={mockChannel.url}
        channel={mockChannel}
        epg={mockEpg}
        onClose={vi.fn()}
      />,
    );

    // Wait for HLS to be initialized before unmounting
    await waitFor(() => {
      expect(mockHlsInstance.loadSource).toHaveBeenCalled();
    });

    unmount();
    expect(mockHlsInstance.destroy).toHaveBeenCalled();
  });
});
