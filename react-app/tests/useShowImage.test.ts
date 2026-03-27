import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProgramImage } from "../src/hooks/useShowImage";
import { Programme, Channel } from "../src/types";

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
  vi.stubGlobal("fetch", mockFetch);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processEpgIconUrl", () => {
    it("should return the EPG icon if it is valid and NOT forced to TVmaze", () => {
      const { result } = renderHook(() =>
        useProgramImage(mockProgramme, mockChannel),
      );
      expect(result.current.posterUrl).toBe("https://example.com/icon.jpg");
      expect(result.current.loading).toBe(false);
    });

    it("should upgrade http to https", () => {
      const progWithHttp = {
        ...mockProgramme,
        icon: "http://example.com/icon.jpg",
      };
      const { result } = renderHook(() =>
        useProgramImage(progWithHttp, mockChannel),
      );
      expect(result.current.posterUrl).toBe("https://example.com/icon.jpg");
    });

    it("should return null for invalid protocols and trigger fetch", async () => {
      const progWithFtp = {
        ...mockProgramme,
        icon: "ftp://example.com/icon.jpg",
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            poster: "https://tvmaze.com/poster.jpg",
            banner: "https://tvmaze.com/banner.jpg",
          }),
      });

      const { result } = renderHook(() =>
        useProgramImage(progWithFtp, mockChannel),
      );

      expect(result.current.posterUrl).toBeNull();
      expect(result.current.loading).toBe(true);

      await waitFor(() => expect(result.current.loading).toBe(false), {
        timeout: 3000,
      });
      expect(result.current.posterUrl).toBe("https://tvmaze.com/poster.jpg");
    });

    it("should fix dimensions for cdn.fullscreen.nz URLs", () => {
      const landscapeUrl =
        "https://cdn.fullscreen.nz/Spotlight/[width]x[height].jpg";
      const prog = { ...mockProgramme, icon: landscapeUrl };
      const { result } = renderHook(() => useProgramImage(prog, mockChannel));
      expect(result.current.posterUrl).toBe(
        "https://cdn.fullscreen.nz/Spotlight/600x338.jpg",
      );

      const posterUrl = "https://cdn.fullscreen.nz/Poster/[width]x[height].jpg";
      const progPoster = { ...mockProgramme, icon: posterUrl };
      const { result: result2 } = renderHook(() =>
        useProgramImage(progPoster, mockChannel),
      );
      expect(result2.current.posterUrl).toBe(
        "https://cdn.fullscreen.nz/Poster/300x450.jpg",
      );
    });
  });

  describe("useProgramImage fetching behavior", () => {
    it("should trigger fetch from backend for forced channels", async () => {
      const forcedChannel = { ...mockChannel, id: "mjh-sky-ptmb" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            poster: "https://tvmaze.com/poster.jpg",
            banner: "https://tvmaze.com/banner.jpg",
          }),
      });

      const { result } = renderHook(() =>
        useProgramImage(mockProgramme, forcedChannel),
      );

      expect(result.current.loading).toBe(true);

      // wait for debounce and fetch
      await waitFor(
        () => {
          expect(result.current.loading).toBe(false);
        },
        { timeout: 3000 },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/image/${encodeURIComponent(mockProgramme.title)}`,
      );
      expect(result.current.posterUrl).toBe("https://tvmaze.com/poster.jpg");
      expect(result.current.bannerUrl).toBe("https://tvmaze.com/banner.jpg");
    });

    it("should not fetch again if the programme title hasn't changed", async () => {
      const forcedChannel = { ...mockChannel, id: "mjh-sky-ptmb" };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            poster: "https://tvmaze.com/poster.jpg",
            banner: "https://tvmaze.com/banner.jpg",
          }),
      });

      const { result, rerender } = renderHook(
        ({ prog, chan }) => useProgramImage(prog, chan),
        { initialProps: { prog: mockProgramme, chan: forcedChannel } },
      );

      await waitFor(() => expect(result.current.loading).toBe(false), {
        timeout: 3000,
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Rerender with SAME title
      rerender({ prog: { ...mockProgramme }, chan: forcedChannel });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Rerender with DIFFERENT title
      const newProg = { ...mockProgramme, title: "New Show" };
      rerender({ prog: newProg, chan: forcedChannel });

      await waitFor(() => expect(result.current.loading).toBe(false), {
        timeout: 3000,
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should handle fetch failures gracefully", async () => {
      const forcedChannel = { ...mockChannel, id: "mjh-sky-ptmb" };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

      const { result } = renderHook(() =>
        useProgramImage(mockProgramme, forcedChannel),
      );

      await waitFor(() => expect(result.current.loading).toBe(false), {
        timeout: 3000,
      });
      expect(result.current.posterUrl).toBeNull();
    });

    it("should handle network errors gracefully", async () => {
      const forcedChannel = { ...mockChannel, id: "mjh-sky-ptmb" };
      mockFetch.mockRejectedValueOnce(new Error("Network Error"));

      const { result } = renderHook(() =>
        useProgramImage(mockProgramme, forcedChannel),
      );

      await waitFor(() => expect(result.current.loading).toBe(false), {
        timeout: 3000,
      });
      expect(result.current.posterUrl).toBeNull();
    });
  });
});
