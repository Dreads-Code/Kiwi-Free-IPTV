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

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamProxyService", () => {
  describe("isAllowedUrl", () => {
    it("should return true for exact matches in ALLOWED_DOMAINS", () => {
      expect(isAllowedUrl("https://i.mjh.nz/nz/tv.m3u8")).toBe(true);
    });

    it("should return true for subdomains of ALLOWED_DOMAINS", () => {
      expect(isAllowedUrl("https://sub.i.mjh.nz/test")).toBe(true);
    });

    it("should return false for unlisted domains", () => {
      expect(isAllowedUrl("https://example.com/video.m3u8")).toBe(false);
    });

    it("should gracefully return false for invalid URL strings", () => {
      expect(isAllowedUrl("not-a-url")).toBe(false);
      expect(isAllowedUrl("")).toBe(false);
    });
  });

  describe("applyProxyRules", () => {
    it("should correctly encode a simple URL into base64 format and return /proxy/{encoded}", () => {
      const url = "https://example.com/stream.m3u8";
      const result = applyProxyRules(url);
      expect(typeof result).toBe("string");
      expect(result.startsWith("/proxy/")).toBe(true);
      expect(decodeProxyUrl(result)).toBe(url);
    });

    it("should correctly encode a URL along with custom headers", () => {
      const url = "https://example.com/stream.m3u8";
      const headers = { "User-Agent": "TestAgent" };
      const result = applyProxyRules(url, headers);
      expect(decodeProxyUrl(result)).toBe(url);
      // To verify headers, we'd need to manually decode or add a getter, but for now url match is good.
      // Let's manually decode just once to be sure.
      const encoded = result.replace("/proxy/", "");
      let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) base64 += "=";
      const decoded = JSON.parse(atob(base64));
      expect(decoded.headers).toEqual(headers);
    });

    it("should handle URL encoding edge cases (replacing + with - and / with _)", () => {
      // Create a payload that would result in + and / in base64
      // "{"url":"https://a.b/c?d=e+f"}" -> base64 often contains / or +
      const url = "https://a.b/c?d=e+f";
      const result = applyProxyRules(url);
      expect(result).not.toContain("+");
      expect(result.substring(7)).not.toContain("/");
    });

    it("should return the original URL if encoding fails", () => {
      const originalBtoa = btoa;
      vi.stubGlobal(
        "btoa",
        vi.fn(() => {
          throw new Error("fail");
        }),
      );

      const url = "https://example.com";
      expect(applyProxyRules(url)).toBe(url);

      vi.stubGlobal("btoa", originalBtoa);
    });
  });

  describe("decodeProxyUrl", () => {
    it("should correctly decode a /proxy/{encoded} URL back into original URL", () => {
      const originalUrl = "https://example.com/video";
      const proxyUrl = applyProxyRules(originalUrl);
      expect(decodeProxyUrl(proxyUrl)).toBe(originalUrl);
    });

    it("should handle missing or malformed proxy parts gracefully", () => {
      expect(decodeProxyUrl("/proxy/")).toBeNull();
      expect(decodeProxyUrl("/not-proxy/abc")).toBeNull();
      expect(decodeProxyUrl("/proxy/invalid-base64-!!!")).toBeNull();
    });

    it("should properly restore + and / characters and pad with =", () => {
      const url = "https://a.b/c?d=e+f";
      const proxyUrl = applyProxyRules(url);
      expect(decodeProxyUrl(proxyUrl)).toBe(url);
    });
  });

  describe("isProxiedUrl", () => {
    it("should return true if URL contains /api/proxy or /proxy/", () => {
      expect(isProxiedUrl("https://mysite.com/proxy/abc")).toBe(true);
      expect(isProxiedUrl("/api/proxy/123")).toBe(true);
    });

    it("should return false otherwise", () => {
      expect(isProxiedUrl("https://i.mjh.nz/nz.m3u8")).toBe(false);
    });
  });

  describe("needsDirectPlay", () => {
    it("should return true for known direct play domains", () => {
      expect(needsDirectPlay("https://skyone.co.nz/live")).toBe(true);
      expect(needsDirectPlay("https://test.akamaized.net/video")).toBe(true);
      expect(needsDirectPlay("https://fullscreen.nz/content")).toBe(true);
    });

    it("should return false for domains that do not require direct play", () => {
      expect(needsDirectPlay("https://i.mjh.nz/nz.m3u8")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(needsDirectPlay("HTTPS://SKYONE.CO.NZ/LIVE")).toBe(true);
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
