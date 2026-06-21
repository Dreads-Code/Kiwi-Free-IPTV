import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// --------------------------------------------------------------------------
// Mock Hls BEFORE importing the hook so the global is in place
// --------------------------------------------------------------------------
const mockHlsInstance = {
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
  subtitleTrack: -1,
  currentLevel: -1,
  levels: [] as { height: number; bitrate: number }[],
  startLoad: vi.fn(),
  recoverMediaError: vi.fn(),
};

const hlsIsSupported = () => true;

const MockHls = function (this: unknown) {
  return mockHlsInstance;
};

MockHls.isSupported = vi.fn(hlsIsSupported);
MockHls.Events = {
  MANIFEST_PARSED: "manifestParsed",
  MANIFEST_LOADED: "manifestLoaded",
  SUBTITLE_TRACKS_UPDATED: "subtitleTracksUpdated",
  ERROR: "error",
} as const;
MockHls.ErrorTypes = {
  NETWORK_ERROR: "networkError",
  MEDIA_ERROR: "mediaError",
  OTHER_ERROR: "otherError",
} as const;

vi.stubGlobal("Hls", MockHls);

// --------------------------------------------------------------------------
// Mock wasm module used by streamProxyService (transitive dependency)
// --------------------------------------------------------------------------
vi.mock("../wasm/iptv_nz_addon_rust.js", () => ({
  is_safe_proxy_url: vi.fn(() => false),
  clean_show_title: vi.fn((t: string) => t),
  process_icon_url: vi.fn((u: string) => u),
}));

import { useHlsPlayer } from "../src/hooks/useHlsPlayer";

// --------------------------------------------------------------------------
// Helper: build a minimal video element mock that satisfies the hook's
// cleanup path (video.removeAttribute, video.load).
// --------------------------------------------------------------------------
function makeVideoMock(
  overrides: Partial<{
    play: () => Promise<void>;
    paused: boolean;
  }> = {},
) {
  return {
    play: vi.fn().mockImplementation(() => Promise.resolve()),
    paused: true,
    removeAttribute: vi.fn(),
    load: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    canPlayType: vi.fn(() => ""),
    textTracks: { addEventListener: vi.fn(), entries: vi.fn(() => []) },
    ...overrides,
  } as unknown as HTMLVideoElement;
}

// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Helper: build a video ref with a captured HLS event callback map
// --------------------------------------------------------------------------
function makeHlsSetup(videoMock: HTMLVideoElement) {
  const callbacks: Record<string, ((event: string, data: unknown) => void) | undefined> = {};
  mockHlsInstance.on.mockImplementation(
    (event: string, cb: (event: string, data: unknown) => void) => {
      callbacks[event] = cb;
    },
  );
  return { videoRef: { current: videoMock }, callbacks };
}

// --------------------------------------------------------------------------

describe("useHlsPlayer – core functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Hls", MockHls);
    MockHls.isSupported.mockReturnValue(true);
    mockHlsInstance.subtitleTrack = -1;
    mockHlsInstance.currentLevel = -1;
  });

  it("calls loadSource and attachMedia when resolvedUrl is provided", () => {
    const videoMock = makeVideoMock();
    const { videoRef } = makeHlsSetup(videoMock);

    renderHook(() =>
      useHlsPlayer({
        videoRef,
        streamUrl: "https://example.com/stream.m3u8",
        resolvedUrl: "https://example.com/stream.m3u8",
        headers: undefined,
      }),
    );

    expect(mockHlsInstance.loadSource).toHaveBeenCalledWith("https://example.com/stream.m3u8");
    expect(mockHlsInstance.attachMedia).toHaveBeenCalledWith(videoMock);
  });

  it("does NOT initialize HLS when resolvedUrl is null", () => {
    const videoMock = makeVideoMock();
    const { videoRef } = makeHlsSetup(videoMock);

    renderHook(() =>
      useHlsPlayer({
        videoRef,
        streamUrl: "https://example.com/stream.m3u8",
        resolvedUrl: null,
        headers: undefined,
      }),
    );

    expect(mockHlsInstance.loadSource).not.toHaveBeenCalled();
    expect(mockHlsInstance.attachMedia).not.toHaveBeenCalled();
  });

  it("updates subtitleTracks when SUBTITLE_TRACKS_UPDATED event fires", () => {
    const videoMock = makeVideoMock();
    const { videoRef, callbacks } = makeHlsSetup(videoMock);

    const { result } = renderHook(() =>
      useHlsPlayer({
        videoRef,
        streamUrl: "https://example.com/stream.m3u8",
        resolvedUrl: "https://example.com/stream.m3u8",
        headers: undefined,
      }),
    );

    act(() => {
      callbacks.subtitleTracksUpdated?.("subtitleTracksUpdated", {
        subtitleTracks: [{ name: "English", lang: "en" }, { lang: "fr" }, {}],
      });
    });

    expect(result.current.subtitleTracks).toEqual([
      { id: 0, label: "English" },
      { id: 1, label: "fr" },
      { id: 2, label: "Track 3" },
    ]);
  });

  it("handleSubtitleChange updates currentSubtitleTrack and sets hlsRef.subtitleTrack", () => {
    const videoMock = makeVideoMock();
    const { videoRef } = makeHlsSetup(videoMock);

    const { result } = renderHook(() =>
      useHlsPlayer({
        videoRef,
        streamUrl: "https://example.com/stream.m3u8",
        resolvedUrl: "https://example.com/stream.m3u8",
        headers: undefined,
      }),
    );

    act(() => {
      result.current.handleSubtitleChange(2);
    });

    expect(result.current.currentSubtitleTrack).toBe(2);
    expect(mockHlsInstance.subtitleTrack).toBe(2);
  });

  it("handleQualityChange updates currentQuality and sets hlsRef.currentLevel", () => {
    const videoMock = makeVideoMock();
    const { videoRef } = makeHlsSetup(videoMock);

    const { result } = renderHook(() =>
      useHlsPlayer({
        videoRef,
        streamUrl: "https://example.com/stream.m3u8",
        resolvedUrl: "https://example.com/stream.m3u8",
        headers: undefined,
      }),
    );

    act(() => {
      result.current.handleQualityChange(1);
    });

    expect(result.current.currentQuality).toBe(1);
    expect(mockHlsInstance.currentLevel).toBe(1);
  });

  it("fatal OTHER_ERROR destroys HLS and sets hlsError", () => {
    const videoMock = makeVideoMock();
    const { videoRef, callbacks } = makeHlsSetup(videoMock);

    const { result } = renderHook(() =>
      useHlsPlayer({
        videoRef,
        streamUrl: "https://example.com/stream.m3u8",
        resolvedUrl: "https://example.com/stream.m3u8",
        headers: undefined,
      }),
    );

    act(() => {
      callbacks.error?.("error", {
        fatal: true,
        type: "otherError",
        details: "internalException",
      });
    });

    expect(result.current.hlsError).toBe("Playback error. Please try again later.");
    expect(mockHlsInstance.destroy).toHaveBeenCalled();
  });

  it("clearHlsError sets hlsError back to null", () => {
    const videoMock = makeVideoMock();
    const { videoRef, callbacks } = makeHlsSetup(videoMock);

    const { result } = renderHook(() =>
      useHlsPlayer({
        videoRef,
        streamUrl: "https://example.com/stream.m3u8",
        resolvedUrl: "https://example.com/stream.m3u8",
        headers: undefined,
      }),
    );

    // Trigger an error first
    act(() => {
      callbacks.error?.("error", {
        fatal: true,
        type: "otherError",
        details: "internalException",
      });
    });
    expect(result.current.hlsError).not.toBeNull();

    act(() => {
      result.current.clearHlsError();
    });

    expect(result.current.hlsError).toBeNull();
  });

  it("bufferStalledError is silently ignored (non-fatal)", () => {
    const videoMock = makeVideoMock();
    const { videoRef, callbacks } = makeHlsSetup(videoMock);

    const { result } = renderHook(() =>
      useHlsPlayer({
        videoRef,
        streamUrl: "https://example.com/stream.m3u8",
        resolvedUrl: "https://example.com/stream.m3u8",
        headers: undefined,
      }),
    );

    act(() => {
      callbacks.error?.("error", {
        fatal: false,
        type: "networkError",
        details: "bufferStalledError",
      });
    });

    expect(result.current.hlsError).toBeNull();
    expect(mockHlsInstance.destroy).not.toHaveBeenCalled();
  });

  it("destroys HLS and cleans up video element on unmount", () => {
    const videoMock = makeVideoMock();
    const { videoRef } = makeHlsSetup(videoMock);

    const { unmount } = renderHook(() =>
      useHlsPlayer({
        videoRef,
        streamUrl: "https://example.com/stream.m3u8",
        resolvedUrl: "https://example.com/stream.m3u8",
        headers: undefined,
      }),
    );

    unmount();
    const { destroy } = mockHlsInstance;

    expect(destroy).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(videoMock.removeAttribute).toHaveBeenCalledWith("src");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(videoMock.load).toHaveBeenCalled();
  });

  it("falls back to video.src for non-HLS URLs", () => {
    const videoMock = makeVideoMock();
    const { videoRef } = makeHlsSetup(videoMock);
    const videoEl = videoMock as unknown as Record<string, unknown>;

    renderHook(() =>
      useHlsPlayer({
        videoRef,
        streamUrl: "https://example.com/video.mp4",
        resolvedUrl: "https://example.com/video.mp4",
        headers: undefined,
      }),
    );

    expect(videoEl.src).toBe("https://example.com/video.mp4");
    expect(mockHlsInstance.loadSource).not.toHaveBeenCalled();
  });
});

describe("useHlsPlayer – error path coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-stub after vitest.setup.ts afterEach runs vi.unstubAllGlobals()
    vi.stubGlobal("Hls", MockHls);
    MockHls.isSupported.mockReturnValue(true);
  });

  // -------------------------------------------------------------------------
  // useHlsPlayer.ts:99 – video.play().catch() inside handleManifestParsed
  // -------------------------------------------------------------------------
  describe("handleManifestParsed – video.play() catch (line 99)", () => {
    it("should swallow AbortError thrown by video.play()", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
        /* no-op */
      });

      const abortError = Object.assign(new Error("aborted"), {
        name: "AbortError",
      });
      const videoMock = makeVideoMock({
        play: vi.fn().mockRejectedValue(abortError),
      });
      const videoRef = { current: videoMock };

      // Capture the MANIFEST_PARSED callback when it is registered
      let manifestParsedCallback: (() => void) | null = null;
      mockHlsInstance.on.mockImplementation((event: string, cb: () => void) => {
        if (event === "manifestParsed") {
          manifestParsedCallback = cb;
        }
      });

      renderHook(() =>
        useHlsPlayer({
          videoRef,
          streamUrl: "https://example.com/stream.m3u8",
          resolvedUrl: "https://example.com/stream.m3u8",
          headers: undefined,
        }),
      );

      await act(async () => {
        manifestParsedCallback?.();
        // Allow requestAnimationFrame + play rejection to settle
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      });

      // AbortError is silently swallowed — console.error must NOT be called for it
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Play failed"),
        abortError,
      );
      consoleErrorSpy.mockRestore();
    });

    it("should log non-AbortError failures from video.play()", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
        /* no-op */
      });

      const networkError = Object.assign(new Error("not allowed"), {
        name: "NotAllowedError",
      });
      const videoMock = makeVideoMock({
        play: vi.fn().mockRejectedValue(networkError),
      });
      const videoRef = { current: videoMock };

      let manifestParsedCallback: (() => void) | null = null;
      mockHlsInstance.on.mockImplementation((event: string, cb: () => void) => {
        if (event === "manifestParsed") {
          manifestParsedCallback = cb;
        }
      });

      renderHook(() =>
        useHlsPlayer({
          videoRef,
          streamUrl: "https://example.com/stream.m3u8",
          resolvedUrl: "https://example.com/stream.m3u8",
          headers: undefined,
        }),
      );

      await act(async () => {
        manifestParsedCallback?.();
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith("[VideoPlayer] Play failed", networkError);
      consoleErrorSpy.mockRestore();
    });
  });
});
