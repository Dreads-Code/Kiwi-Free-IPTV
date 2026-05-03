import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";

import {
  isAllowedUrl,
  applyProxyRules,
  decodeProxyUrl,
  isProxiedUrl,
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
    it("should return /proxy/<encoded> for a normal URL", () => {
      const result = applyProxyRules("https://example.com/stream.m3u8");
      expect(result).toMatch(/^\/proxy\//);
    });

    // -----------------------------------------------------------------------
    // streamProxyService.ts:51 – catch block when btoa / JSON.stringify fails
    // -----------------------------------------------------------------------
    it("should fall back to the original URL when encoding throws (line 51)", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {
          /* no-op */
        });

      // Force btoa to throw so the catch block is exercised
      vi.stubGlobal("btoa", () => {
        throw new Error("btoa not available");
      });

      const url = "https://example.com/stream.m3u8";
      const result = applyProxyRules(url);

      expect(result).toBe(url);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to encode proxy payload:",
        expect.any(Error),
      );

      vi.unstubAllGlobals();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("decodeProxyUrl", () => {
    it("should return null if the URL does not contain /proxy/", () => {
      expect(decodeProxyUrl("https://example.com/stream.m3u8")).toBeNull();
    });

    it("should return null if there is no encoded portion in the URL", () => {
      expect(decodeProxyUrl("/proxy/")).toBeNull();
    });

    it("should return null if the encoded string is not valid base64 (line 73)", () => {
      // "!!!" is not valid base64 and will cause atob to throw
      expect(decodeProxyUrl("/proxy/!!!")).toBeNull();
    });

    it("should return null if the base64 is valid but the content is not valid JSON (line 73)", () => {
      // btoa("not-json") = "bm90LWpzb24="
      const invalidJson = btoa("not-json");
      expect(decodeProxyUrl(`/proxy/${invalidJson}`)).toBeNull();
    });

    it("should return null if the JSON is valid but does not contain the url property", () => {
      const emptyJson = btoa("{}");
      expect(decodeProxyUrl(`/proxy/${emptyJson}`)).toBeNull();
    });

    it("should correctly decode a valid proxy URL", () => {
      const originalUrl = "https://example.com/stream.m3u8";
      const proxyUrl = applyProxyRules(originalUrl);
      expect(decodeProxyUrl(proxyUrl)).toBe(originalUrl);
    });
  });

  describe("isProxiedUrl", () => {
    it("should return true for URLs containing /api/proxy", () => {
      expect(isProxiedUrl("https://example.com/api/proxy/stream")).toBe(true);
      expect(isProxiedUrl("/api/proxy/abc123")).toBe(true);
    });

    it("should return true for URLs containing /proxy/", () => {
      expect(isProxiedUrl("/proxy/abc123")).toBe(true);
      expect(isProxiedUrl("https://example.com/proxy/encoded")).toBe(true);
    });

    it("should return false for regular stream URLs", () => {
      expect(isProxiedUrl("https://example.com/stream.m3u8")).toBe(false);
      expect(isProxiedUrl("https://i.mjh.nz/nz.m3u8")).toBe(false);
      expect(isProxiedUrl("https://fullscreen.nz/live")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isProxiedUrl("")).toBe(false);
    });
  });

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
