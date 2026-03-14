/**
 * Service to handle proxy URL rewriting and security validation for streams.
 * Centralizes the logic used in both the frontend VideoPlayer and server-side redirect/proxy APIs.
 */

const ALLOWED_DOMAINS = [
  "i.mjh.nz",
  "d38thhtbc3g3fc.cloudfront.net",
  "d47743dknc7xq.cloudfront.net",
  "dfecjp0pnemzw.cloudfront.net",
  "info.shinetv.co.nz",
  "shinetv.co.nz",
  "kordia.net.nz",
  "akamaized.net",
  "brightcove.com",
  "tvnz.co.nz",
  "threenow.co.nz",
  "discovery.com",
  "api.tvmaze.com",
  "www.tvmaze.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "github.com",
  "cloudfront.net",
  "fullscreen.nz",
  "tulix.tv",
  "vimeo.com",
];

const HIGH_CONFIDENCE_DIRECT_DOMAINS: string[] = [
  "fullscreen.nz",
  "skyone.co.nz",
  "akamaized.net",
  "cloudfront.net",
];

/**
 * Validates if a URL is allowed based on the hostname allowlist.
 */
export const isAllowedUrl = (url: string | URL): boolean => {
  try {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    const hostname = urlObj.hostname.toLowerCase();

    return ALLOWED_DOMAINS.some(
      (allowed) => hostname === allowed || hostname.endsWith("." + allowed),
    );
  } catch {
    return false;
  }
};

/**
 * Encodes a URL and its headers into a proxy format.
 * Uses Base64 (URL-safe) to pass the complex payload to the Rust proxy endpoint.
 * @param url The target stream URL
 * @param headers Optional HTTP headers required for the stream
 * @returns A proxied URL string
 */
export const applyProxyRules = (
  url: string,
  headers?: Record<string, string>,
): string => {
  try {
    const payload: { url: string; headers?: Record<string, string> } = { url };
    if (headers && Object.keys(headers).length > 0) {
      payload.headers = headers;
    }

    const jsonStr = JSON.stringify(payload);
    const encoded = btoa(jsonStr)
      .split("=")[0]
      .replaceAll("+", "-")
      .replaceAll("/", "_");

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
    const payload = JSON.parse(jsonStr) as { url: string };
    return payload.url;
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
    urlLower.includes("vimeo.com")
  );
};

export const isHighConfidenceDirect = (url: string): boolean => {
  const urlLower = url.toLowerCase();
  return HIGH_CONFIDENCE_DIRECT_DOMAINS.some((domain) =>
    urlLower.includes(domain),
  );
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
