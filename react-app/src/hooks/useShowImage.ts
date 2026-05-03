import { useState, useEffect } from "react";
import { Programme, Channel } from "../types";
import {
  clean_show_title,
  process_icon_url,
} from "../wasm/iptv_nz_addon_rust.js";

// Global cache for in-flight requests to prevent duplicate searches
const inflightRequests = new Map<
  string,
  Promise<{ poster: string | null; banner: string | null } | null>
>();

interface TvMazeShow {
  id: number;
  image?: {
    original?: string;
    medium?: string;
  };
}

interface TvMazeSearchResult {
  show: TvMazeShow;
}

interface TvMazeImage {
  type: string;
  main?: boolean;
  resolutions?: {
    original?: {
      url?: string;
    };
  };
}

/**
 * A custom hook to fetch a TV show's poster and banner images.
 * It prioritizes the icon provided in the EPG data and falls back to standalone enrichment.
 * Enrichment is performed locally in the browser using the WASM engine for title logic
 * and the backend /api/fetch byte-pipe for network access.
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

  // Use the WASM engine to process the EPG icon locally
  const initialEpgIcon = programme?.icon
    ? process_icon_url(programme.icon) ?? undefined
    : undefined;

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

    const enrichImage = async () => {
      try {
        // 1. Clean title using WASM engine first - this is our true identity
        const cleanedTitle = clean_show_title(programme.title);
        if (!cleanedTitle) return;

        const cacheKey = `tvmaze_v2_${cleanedTitle.toLowerCase()}`;

        // 2. Check LocalStorage persistent cache
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as {
              poster: string | null;
              banner: string | null;
            };
            if (isMounted) {
              setFetchedData({
                title: programme.title,
                poster: parsed.poster,
                banner: parsed.banner,
              });
            }
            return;
          } catch {
            localStorage.removeItem(cacheKey);
          }
        }

        // 3. Check for an in-flight duplicate request
        if (inflightRequests.has(cacheKey)) {
          setLoading(true);
          const result = await inflightRequests.get(cacheKey);
          if (isMounted && result) {
            setFetchedData({
              title: programme.title,
              poster: result.poster,
              banner: result.banner,
            });
          }
          setLoading(false);
          return;
        }

        setLoading(true);

        // 4. Create new enrichment promise
        const enrichmentPromise = (async () => {
          try {
            // Search TVMaze via Byte-Pipe
            const searchUrl = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(cleanedTitle)}`;
            const searchRes = await fetch(
              `/api/fetch?url=${encodeURIComponent(searchUrl)}`,
            );
            if (!searchRes.ok) throw new Error("Search failed");

            const searchData = (await searchRes.json()) as TvMazeSearchResult[];
            if (!searchData || searchData.length === 0) {
              return { poster: null, banner: null };
            }

            const show = searchData[0].show;
            const showId = show.id;

            let poster = show.image?.original ?? show.image?.medium ?? null;
            let banner = null;

            // Fetch additional assets if needed
            const assetsUrl = `https://api.tvmaze.com/shows/${showId.toString()}/images`;
            const assetsRes = await fetch(
              `/api/fetch?url=${encodeURIComponent(assetsUrl)}`,
            );
            if (assetsRes.ok) {
              const assets = (await assetsRes.json()) as TvMazeImage[];
              for (const img of assets) {
                if (banner === null && img.type === "banner") {
                  banner = img.resolutions?.original?.url ?? null;
                }
                if (img.type === "poster" && img.main === true) {
                  poster = img.resolutions?.original?.url ?? poster;
                }
              }
            }

            return { poster, banner };
          } catch (error) {
            console.warn("[useProgramImage] Fetch failed:", error);
            return null;
          }
        })();

        // Track the promise so others can wait for it
        inflightRequests.set(cacheKey, enrichmentPromise);

        const result = await enrichmentPromise;

        // Remove from inflight once done
        inflightRequests.delete(cacheKey);

        if (isMounted && result) {
          setFetchedData({
            title: programme.title,
            poster: result.poster,
            banner: result.banner,
          });
          // Save to persistent cache
          localStorage.setItem(cacheKey, JSON.stringify(result));
        }
      } catch (error) {
        console.warn("[useProgramImage] Standalone enrichment failed:", error);
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
