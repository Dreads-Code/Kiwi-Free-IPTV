import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";

import {
  isAllowedUrl,
  decodeProxyUrl,
  needsDirectPlay,
  isHighConfidenceDirect,
  resolveStreamUrl,
} from "../src/services/streamProxyService";

vi.mock("../wasm/iptv_nz_addon_rust.js", () => ({
  is_safe_proxy_url: vi.fn((url: string) => {
    const urlLower = url.toLowerCase();
    return (
      urlLower.includes("i.mjh.nz") ||
      urlLower.includes("thehlive.com") ||
      urlLower.includes("fullscreen.nz")
    );
  }),
}));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const mockCheck = (url: string) => {
  const urlLower = url.toLowerCase();
  return (
    urlLower.includes("i.mjh.nz") ||
    urlLower.includes("thehlive.com") ||
    urlLower.includes("fullscreen.nz")
  );
};

describe("streamProxyService", () => {
  describe("isAllowedUrl", () => {
    it("should return true for known allowed domains", () => {
      expect(isAllowedUrl("https://i.mjh.nz/nz/tv.m3u8", mockCheck)).toBe(true);
    });

    it("should return true for safe providers like Al Jazeera", () => {
      expect(isAllowedUrl("https://thehlive.com/live.m3u8", mockCheck)).toBe(
        true,
      );
    });

    it("should return false for unlisted domains", () => {
      expect(isAllowedUrl("https://example.com/video.m3u8", mockCheck)).toBe(
        false,
      );
    });
  });

  describe("applyProxyRules", () => {
    // ... (rest of applyProxyRules is fine)
  });

  // ...

  describe("needsDirectPlay", () => {
    it("should return true for known direct play domains", () => {
      expect(needsDirectPlay("https://skyone.co.nz/live")).toBe(true);
      expect(needsDirectPlay("https://test.akamaized.net/video")).toBe(true);
      expect(needsDirectPlay("https://fullscreen.nz/content")).toBe(true);
      expect(needsDirectPlay("https://thehlive.com/live")).toBe(true);
    });

    it("should return false for domains that still need mjh handshake", () => {
      expect(needsDirectPlay("https://i.mjh.nz/nz.m3u8")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(needsDirectPlay("HTTPS://THEHLIVE.COM/LIVE")).toBe(true);
    });
  });

  describe("isHighConfidenceDirect", () => {
    it("should return true for high-confidence direct domains", () => {
      expect(isHighConfidenceDirect("https://fullscreen.nz/test")).toBe(true);
    });

    it("should return false for others", () => {
      expect(isHighConfidenceDirect("https://i.mjh.nz/nz.m3u8")).toBe(false);
    });
  });

  describe("resolveStreamUrl", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should immediately return if already proxied or ends in .ts/.mp4", async () => {
      expect(await resolveStreamUrl("/proxy/abc")).toBe("/proxy/abc");
      expect(await resolveStreamUrl("https://ext.com/file.ts")).toBe(
        "https://ext.com/file.ts",
      );
      expect(await resolveStreamUrl("https://ext.com/vid.mp4")).toBe(
        "https://ext.com/vid.mp4",
      );
    });

    it("should resolve mjh handshake by making request and returning redirected URL", async () => {
      const initialUrl = "https://i.mjh.nz/nz/tv.m3u8";
      const redirectedUrl = "https://redirected.com/stream.m3u8";

      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        url: redirectedUrl,
        status: 200,
      });

      // It also checks needsDirectPlay for the redirected URL.
      // i.mjh.nz typically redirects to something that needs proxying unless it's in direct play list.
      const result = await resolveStreamUrl(initialUrl);

      expect(result).toMatch(/^\/proxy\//);
      expect(decodeProxyUrl(result)).toBe(redirectedUrl);
    });

    it("should return targetUrl immediately if needsDirectPlay is true", async () => {
      const directUrl = "https://fullscreen.nz/stream.m3u8";
      expect(await resolveStreamUrl(directUrl)).toBe(directUrl);
    });

    it("should handle handshake failures gracefully and proceed with fallback", async () => {
      const initialUrl = "https://i.mjh.nz/nz/tv.m3u8";
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

      const result = await resolveStreamUrl(initialUrl);
      expect(result.startsWith("/proxy/")).toBe(true);
      expect(decodeProxyUrl(result)).toBe(initialUrl);
    });
  });
});
