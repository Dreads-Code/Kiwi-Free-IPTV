/**
 * Service to handle proxy URL rewriting and security validation for streams.
 * Centralizes the logic used in both the frontend VideoPlayer and server-side redirect/proxy APIs.
 */

import { is_safe_proxy_url } from "../wasm/iptv_nz_addon_rust.js";

const HIGH_CONFIDENCE_DIRECT_DOMAINS: string[] = [
  "fullscreen.nz",
  "skyone.co.nz",
  "akamaized.net",
  "cloudfront.net",
];

/**
 * Validates if a URL is allowed based on the Rust engine's safety rules.
 * Supports dependency injection for testing.
 */
export const isAllowedUrl = (
  url: string | URL,
  checkFn: (u: string) => boolean = is_safe_proxy_url,
): boolean => {
  const urlStr = typeof url === "string" ? url : url.toString();
  return checkFn(urlStr);
};

/**
 * Encodes a URL and its headers into a proxy format.
 * Uses Base64 (URL-safe) to pass the complex payload to the Rust proxy endpoint.
 * @param url The target stream URL
 * @param headers Optional HTTP headers required for the stream
 * @returns A proxied URL string
 */
export const applyProxyRules = (url: string, headers?: Record<string, string>): string => {
  try {
    // Ensure the URL is valid before attempting to encode it
    new URL(url);

    const payload: { url: string; headers?: Record<string, string> } = { url };
    if (headers && Object.keys(headers).length > 0) {
      payload.headers = headers;
    }

    const jsonStr = JSON.stringify(payload);
    const encoded = btoa(jsonStr).split("=")[0].replaceAll("+", "-").replaceAll("/", "_");

    return `/proxy/${encoded}`;
  } catch (error) {
    console.error("Failed to encode proxy payload:", error);
    return url;
  }
};

export const decodeProxyUrl = (proxyUrl: string): string | null => {
  if (!proxyUrl.includes("/proxy/")) return null;

  try {
    const parts = proxyUrl.split("/proxy/");
    const encoded = parts.at(-1);
    if (!encoded) return null;

    let base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
    while (base64.length % 4) {
      base64 += "=";
    }

    const jsonStr = atob(base64);
    const payload = JSON.parse(jsonStr) as { url?: string };
    return payload.url ?? null;
  } catch {
    return null;
  }
};

export const isProxiedUrl = (url: string): boolean => {
  return url.includes("/api/proxy") || url.includes("/proxy/");
};

export const needsDirectPlay = (url: string): boolean => {
  const urlLower = url.toLowerCase();
  return (
    urlLower.includes("skyone.co.nz") ||
    urlLower.includes("fullscreen.nz") ||
    urlLower.includes("akamaized.net") ||
    urlLower.includes("cloudfront.net") ||
    urlLower.includes("tulix.tv") ||
    urlLower.includes("shinetv.co.nz") ||
    urlLower.includes("f3.nz") ||
    urlLower.includes("vimeo.com") ||
    urlLower.includes("amagi.tv") ||
    urlLower.includes("edgecastcdn.net") ||
    urlLower.includes("fastly.net") ||
    urlLower.includes("thehlive.com") ||
    urlLower.includes("juicex.nz") ||
    urlLower.includes("ten.co.nz") ||
    urlLower.includes("wairarapatv.co.nz") ||
    urlLower.includes("kordia.net.nz") ||
    urlLower.includes("hopto.me") ||
    urlLower.includes("brightcove.com") ||
    urlLower.includes("googlevideo.com")
  );
};

export const isHighConfidenceDirect = (url: string): boolean => {
  const urlLower = url.toLowerCase();
  return HIGH_CONFIDENCE_DIRECT_DOMAINS.some((domain) => urlLower.includes(domain));
};

export const resolveStreamUrl = async (
  url: string,
  headers?: Record<string, string>,
): Promise<string> => {
  if (isProxiedUrl(url) || url.includes(".ts") || url.includes(".mp4")) {
    return url;
  }

  let targetUrl = url;
  const isMjhHandshake = url.includes("i.mjh.nz");

  if (isMjhHandshake) {
    try {
      let response = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
      });

      if (!response.ok && response.status !== 0) {
        response = await fetch(url, {
          method: "GET",
          redirect: "follow",
        });
      }

      if (response.ok || response.status === 0) {
        targetUrl = response.url;
      }
    } catch {
      // Background resolution failed, let VideoPlayer handle retry/fallback
    }
  }

  if (needsDirectPlay(targetUrl)) {
    return targetUrl;
  }

  return applyProxyRules(targetUrl, headers);
};
