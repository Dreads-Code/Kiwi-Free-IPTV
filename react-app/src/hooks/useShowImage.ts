import { useState, useEffect } from "react";
import { Programme, Channel } from "../types";

/**
 * Processes an EPG icon URL to fix common issues and validate its format.
 * This is a lightweight version for the frontend; the backend also performs this validation.
 * @param url The raw icon URL from the EPG
 * @returns A validated/fixed URL or undefined
 */
const processEpgIconUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;

  let processedUrl = url;

  // Ensure HTTPS/HTTP only
  if (
    !processedUrl.startsWith("https://") &&
    !processedUrl.startsWith("http://")
  ) {
    return undefined;
  }

  if (processedUrl.startsWith("http://")) {
    processedUrl = processedUrl.replace("http://", "https://");
  }

  // Fix placeholders
  if (processedUrl.includes("cdn.fullscreen.nz")) {
    const isLandscape =
      processedUrl.includes("Spotlight") || processedUrl.includes("Banner");
    processedUrl = processedUrl
      .replaceAll("[height]", isLandscape ? "338" : "450")
      .replaceAll("[width]", isLandscape ? "600" : "300");
  }

  try {
    const parsed = new URL(processedUrl);
    const pathname = parsed.pathname.toLowerCase();
    const search = parsed.search.toLowerCase();
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

    const isImagePath = imageExtensions.some((ext) => pathname.endsWith(ext));
    const isImageQuery = imageExtensions.some(
      (ext) => search.includes(ext.substring(1)) || search.includes("format="),
    );
    const isTrustedCdn = processedUrl.includes("cdn.fullscreen.nz");

    if (!isImagePath && !isImageQuery && !isTrustedCdn) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return processedUrl;
};

/**
 * A custom hook to fetch a TV show's poster and banner images.
 * It prioritizes the icon provided in the EPG data and falls back to our Rust backend's enrichment endpoint.
 * @param programme The current programme object
 * @param channel The current channel object
 * @returns An object containing posterUrl, bannerUrl, and loading state
 */
export const useProgramImage = (
  programme: Programme | null | undefined,
  channel: Channel | null | undefined,
) => {
  const lowerId = channel?.id.toLowerCase() ?? "";
  const forceEnrichment = lowerId.includes("ptmb") || lowerId.includes("ptgn");
  const initialEpgIcon = processEpgIconUrl(programme?.icon);

  // Determine if we should use the EPG icon
  const shouldUseEpg = !!(initialEpgIcon && !forceEnrichment);

  const [fetchedData, setFetchedData] = useState<{
    title: string;
    poster: string | null;
    banner: string | null;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (shouldUseEpg || !programme?.title) {
      return;
    }

    if (fetchedData?.title === programme.title) {
      return;
    }

    let isMounted = true;
    setLoading(true);

    const enrichImage = async () => {
      try {
        const response = await fetch(
          `/api/image/${encodeURIComponent(programme.title)}`,
        );
        if (!response.ok) throw new Error("Failed to fetch");
        const images = await response.json();

        if (isMounted) {
          setFetchedData({
            title: programme.title,
            poster: images?.poster ?? null,
            banner: images?.banner ?? null,
          });
        }
      } catch (error) {
        console.warn("[useProgramImage] Enrichment failed:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    const handler = setTimeout(() => {
      void enrichImage();
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(handler);
    };
  }, [programme?.title, shouldUseEpg, fetchedData?.title]);

  if (shouldUseEpg) {
    return { posterUrl: initialEpgIcon, bannerUrl: null, loading: false };
  }

  const isDataValid = fetchedData?.title === programme?.title;

  return {
    posterUrl: isDataValid ? (fetchedData?.poster ?? null) : null,
    bannerUrl: isDataValid ? (fetchedData?.banner ?? null) : null,
    loading,
  };
};
