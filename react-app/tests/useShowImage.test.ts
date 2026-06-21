import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProgramImage } from "../src/hooks/useShowImage";
import { Programme, Channel } from "../src/types";

// Mock the wasm module so process_icon_url and clean_show_title work in jsdom
vi.mock("../src/wasm/iptv_nz_addon_rust.js", () => ({
  process_icon_url: vi.fn((url: string) => {
    if (!url) return null;
    // Simple replica of key rules for testing
    if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
    // Upgrade http to https
    let result = url.replace(/^http:\/\//, "https://");
    // Replace cdn.fullscreen.nz dimension placeholders
    if (result.includes("cdn.fullscreen.nz") && result.includes("[width]x[height]")) {
      const isPoster = /\/poster\//i.test(result);
      result = result.replace("[width]x[height]", isPoster ? "300x450" : "600x338");
    }
    return result;
  }),
  clean_show_title: vi.fn((title: string) => title),
}));

describe("useProgramImage", () => {
  const mockProgramme: Programme = {
    channelId: "nz-tv1",
    start: new Date(),
    stop: new Date(),
    startMs: Date.now(),
    stopMs: Date.now() + 3_600_000,
    title: "Test Show",
    description: "Test Description",
    icon: "https://example.com/icon.jpg",
  };

  const mockChannel: Channel = {
    id: "nz-tv1",
    name: "TVNZ 1",
    logo: "https://example.com/logo.png",
    url: "https://example.com/stream.m3u8",
    epg_id: "nz-tv1",
    category: "New Zealand",
  };

  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-stub after vitest.setup.ts afterEach calls vi.unstubAllGlobals()
    vi.stubGlobal("fetch", mockFetch);
    // Clear localStorage to prevent cache pollution between tests
    window.localStorage.clear();
  });

  describe("processEpgIconUrl", () => {
    it("should return the EPG icon if it is valid and NOT forced to TVmaze", () => {
      const { result } = renderHook(() => useProgramImage(mockProgramme, mockChannel));
      expect(result.current.posterUrl).toBe("https://example.com/icon.jpg");
      expect(result.current.loading).toBe(false);
    });

    it("should upgrade http to https", () => {
      const progWithHttp = {
        ...mockProgramme,
        icon: "http://example.com/icon.jpg",
      };
      const { result } = renderHook(() => useProgramImage(progWithHttp, mockChannel));
      expect(result.current.posterUrl).toBe("https://example.com/icon.jpg");
    });

    it("should return null for invalid protocols and trigger fetch", async () => {
      const progWithFtp = {
        ...mockProgramme,
        icon: "ftp://example.com/icon.jpg",
      };
      // Hook makes 2 TVmaze calls: search then assets
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                show: {
                  id: 1,
                  image: { original: "https://tvmaze.com/poster.jpg" },
                },
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      const { result } = renderHook(() => useProgramImage(progWithFtp, mockChannel));

      expect(result.current.posterUrl).toBeNull();

      await waitFor(
        () => {
          expect(result.current.posterUrl).toBe("https://tvmaze.com/poster.jpg");
        },
        { timeout: 3000 },
      );
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/api/fetch?url="));
    });

    it("should fix dimensions for cdn.fullscreen.nz URLs", () => {
      const landscapeUrl = "https://cdn.fullscreen.nz/Spotlight/[width]x[height].jpg";
      const prog = { ...mockProgramme, icon: landscapeUrl };
      const { result } = renderHook(() => useProgramImage(prog, mockChannel));
      expect(result.current.posterUrl).toBe("https://cdn.fullscreen.nz/Spotlight/600x338.jpg");

      const posterUrl = "https://cdn.fullscreen.nz/Poster/[width]x[height].jpg";
      const progPoster = { ...mockProgramme, icon: posterUrl };
      const { result: result2 } = renderHook(() => useProgramImage(progPoster, mockChannel));
      expect(result2.current.posterUrl).toBe("https://cdn.fullscreen.nz/Poster/300x450.jpg");
    });
  });

  describe("useProgramImage fetching behavior", () => {
    it("should trigger fetch from backend for forced channels", async () => {
      const forcedChannel = { ...mockChannel, id: "mjh-sky-ptmb" };
      // Hook makes 2 TVmaze calls: search then assets (assets provides the banner)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                show: {
                  id: 1,
                  image: { original: "https://tvmaze.com/poster.jpg" },
                },
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                type: "banner",
                resolutions: {
                  original: { url: "https://tvmaze.com/banner.jpg" },
                },
              },
            ]),
        });

      const { result } = renderHook(() => useProgramImage(mockProgramme, forcedChannel));

      // wait for debounce and fetch to complete
      await waitFor(
        () => {
          expect(result.current.posterUrl).toBe("https://tvmaze.com/poster.jpg");
        },
        { timeout: 3000 },
      );

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/api/fetch?url="));
      expect(result.current.bannerUrl).toBe("https://tvmaze.com/banner.jpg");
    });

    it("should not fetch again if the programme title hasn't changed", async () => {
      const forcedChannel = { ...mockChannel, id: "mjh-sky-ptmb" };
      // Each enrichment makes 2 TVmaze calls (search + assets); use mockResolvedValue
      // so all calls return a valid TVmaze search response
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              show: {
                id: 1,
                image: { original: "https://tvmaze.com/poster.jpg" },
              },
            },
          ]),
      });

      const { result, rerender } = renderHook(({ prog, chan }) => useProgramImage(prog, chan), {
        initialProps: { prog: mockProgramme, chan: forcedChannel },
      });

      // Wait for the first enrichment to complete
      await waitFor(
        () => {
          expect(result.current.posterUrl).toBe("https://tvmaze.com/poster.jpg");
        },
        { timeout: 3000 },
      );
      // First enrichment = 2 fetch calls (search + assets)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Rerender with SAME title — no new fetch
      rerender({ prog: { ...mockProgramme }, chan: forcedChannel });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Rerender with DIFFERENT title — triggers another enrichment (2 more calls)
      const newProg = { ...mockProgramme, title: "New Show" };
      rerender({ prog: newProg, chan: forcedChannel });

      await waitFor(
        () => {
          expect(result.current.posterUrl).toBe("https://tvmaze.com/poster.jpg");
        },
        { timeout: 3000 },
      );
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("should handle fetch failures gracefully", async () => {
      const forcedChannel = { ...mockChannel, id: "mjh-sky-ptmb" };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

      const { result } = renderHook(() => useProgramImage(mockProgramme, forcedChannel));

      await waitFor(
        () => {
          expect(result.current.loading).toBe(false);
        },
        {
          timeout: 3000,
        },
      );
      expect(result.current.posterUrl).toBeNull();
    });

    it("should handle network errors gracefully", async () => {
      const forcedChannel = { ...mockChannel, id: "mjh-sky-ptmb" };
      mockFetch.mockRejectedValueOnce(new Error("Network Error"));

      const { result } = renderHook(() => useProgramImage(mockProgramme, forcedChannel));

      await waitFor(
        () => {
          expect(result.current.loading).toBe(false);
        },
        {
          timeout: 3000,
        },
      );
      expect(result.current.posterUrl).toBeNull();
    });

    // -----------------------------------------------------------------------
    // useShowImage.ts:138 – inner enrichmentPromise catch block
    // Covers the path where the TVMaze fetch throws inside the inner IIFE.
    // -----------------------------------------------------------------------
    it("should return null posterUrl when inner enrichment fetch throws (line 138)", async () => {
      const forcedChannel = { ...mockChannel, id: "mjh-sky-ptmb" };
      // Suppress warn output during this test
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {
        /* no-op */
      });
      // All fetch calls reject (covers the inner catch path)
      mockFetch.mockRejectedValue(new Error("inner network failure"));

      const { result } = renderHook(() =>
        useProgramImage({ ...mockProgramme, title: "Inner Catch Show" }, forcedChannel),
      );

      await waitFor(
        () => {
          expect(result.current.loading).toBe(false);
        },
        {
          timeout: 3000,
        },
      );

      // The inner catch should swallow the error; poster must be null
      expect(result.current.posterUrl).toBeNull();
      expect(result.current.bannerUrl).toBeNull();
      consoleSpy.mockRestore();
    });

    // -----------------------------------------------------------------------
    // useShowImage.ts:161 – outer catch block of enrichImage()
    // The outer catch fires when localStorage.setItem (or another operation
    // outside the inner try) throws after a successful fetch.
    // -----------------------------------------------------------------------
    it("should recover gracefully when outer enrichment code throws (line 161)", async () => {
      const forcedChannel = { ...mockChannel, id: "mjh-sky-ptmb" };
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {
        /* no-op */
      });

      // Successful search response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                show: {
                  id: 42,
                  image: { original: "https://tvmaze.com/poster.jpg" },
                },
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      // Force localStorage.setItem to throw — this is inside the outer try
      // so the outer catch (line 161) will fire
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("storage quota exceeded");
      });
      // Also mock getItem to return null so the cache check doesn't short-circuit
      const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

      const { result } = renderHook(() =>
        useProgramImage({ ...mockProgramme, title: "Outer Catch Show" }, forcedChannel),
      );

      await waitFor(
        () => {
          expect(result.current.loading).toBe(false);
        },
        {
          timeout: 3000,
        },
      );

      // The outer catch should have fired; loading must return to false
      // The component should not crash even though setItem threw
      expect(result.current.loading).toBe(false);

      setItemSpy.mockRestore();
      getItemSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });
});
