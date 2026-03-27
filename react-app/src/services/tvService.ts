import { Channel, EpgData, Programme } from "../types";

const parseEpgDate = (dateStr: string | undefined | null): Date | null => {
  // dateStr format is "20240728000000 +1200"
  if (!dateStr || dateStr.length < 20) return null;

  try {
    const year = Number.parseInt(dateStr.slice(0, 4), 10);
    const month = Number.parseInt(dateStr.slice(4, 6), 10) - 1;
    const day = Number.parseInt(dateStr.slice(6, 8), 10);
    const hour = Number.parseInt(dateStr.slice(8, 10), 10);
    const minute = Number.parseInt(dateStr.slice(10, 12), 10);
    const second = Number.parseInt(dateStr.slice(12, 14), 10);

    const sign = dateStr[15] === "-" ? -1 : 1;
    const tzHour = Number.parseInt(dateStr.slice(16, 18), 10);
    const tzMin = Number.parseInt(dateStr.slice(18, 20), 10);
    const offsetMs = sign * (tzHour * 60 + tzMin) * 60 * 1000;

    const utcMs = Date.UTC(year, month, day, hour, minute, second);
    return new Date(utcMs - offsetMs);
  } catch {
    return null;
  }
};

interface RustProgramme {
  start: string;
  stop: string;
  channel: string;
  title?: string;
  desc?: string;
  icon?: { src: string };
  category?: string[];
  date?: string;
  rating?: { value?: string };
  star_rating?: { value?: string };
}

interface RustChannelMeta {
  id: string;
  name: string;
  logo?: string;
  url: string;
  category: string;
  programmes: RustProgramme[];
  http_headers?: Record<string, string>;
  description: string;
}

import {
  parse_nz_channels,
  process_icon_url,
  clean_show_title,
} from "../wasm/iptv_nz_addon_rust.js";
import { epgCache } from "../utils/indexedDb.js";

// Official MJH URLs (CORS restricted in browser, but reachable via our /api/fetch byte-pipe)
const MJH_NZ_M3U8 = "https://i.mjh.nz/nz/raw-tv.m3u8";
const MJH_NZ_EPG = "https://i.mjh.nz/nz/epg.xml";

const EPG_CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Fetches consolidated channel and EPG data.
 * Standalone WASM parsing with Backend Byte-Pipe (Option B).
 * Backend only handles the raw byte transfer to bypass CORS.
 */
export const fetchAllData = async (): Promise<{
  channels: Channel[];
  epg: EpgData;
}> => {
  // 1. Check persistent cache for EPG (8MB is too big for Every reload)
  const cachedEpg = await epgCache.get("epg_xml", EPG_CACHE_TTL);

  let m3u8Text: string;
  let epgText: string;

  if (cachedEpg) {
    const m3u8Res = await fetch(
      `/api/fetch?url=${encodeURIComponent(MJH_NZ_M3U8)}`,
    );
    if (!m3u8Res.ok) throw new Error(`Failed to fetch M3U8: ${m3u8Res.status}`);
    m3u8Text = await m3u8Res.text();
    epgText = cachedEpg;
  } else {
    const [m3u8Res, epgRes] = await Promise.all([
      fetch(`/api/fetch?url=${encodeURIComponent(MJH_NZ_M3U8)}`),
      fetch(`/api/fetch?url=${encodeURIComponent(MJH_NZ_EPG)}`),
    ]);

    if (!m3u8Res.ok || !epgRes.ok) {
      throw new Error(
        `Failed to fetch data from source: M3U8=${m3u8Res.status}, EPG=${epgRes.status}`,
      );
    }

    m3u8Text = await m3u8Res.text();
    epgText = await epgRes.text();

    // Save to persistent cache
    await epgCache.set("epg_xml", epgText);
  }

  // Use the optimized Rust engine to parse everything locally in the browser
  const rustData = parse_nz_channels(m3u8Text, epgText) as RustChannelMeta[];

  const channels: Channel[] = [];
  const epg: EpgData = new Map();

  for (const meta of rustData) {
    // 1. Map to Channel object
    channels.push({
      id: meta.id,
      name: meta.name,
      logo: process_icon_url(meta.logo || "") || meta.logo || "",
      url: meta.url,
      epg_id: meta.id,
      category: meta.category as Channel["category"],
      headers: meta.http_headers,
    });

    // 2. Map to Programme objects in the same pass (avoiding .map().filter())
    const programmes: Programme[] = [];
    for (const p of meta.programmes) {
      const start = parseEpgDate(p.start);
      const stop = parseEpgDate(p.stop);
      if (!start || !stop) continue;

      programmes.push({
        channelId: meta.id,
        start,
        stop,
        startMs: start.getTime(),
        stopMs: stop.getTime(),
        title: clean_show_title(p.title ?? "No Title"),
        description: p.desc ?? meta.description,
        rating: p.rating?.value,
        icon: process_icon_url(p.icon?.src || "") || p.icon?.src,
        categories: p.category,
        date: p.date,
        starRating: p.star_rating?.value,
      } as Programme);
    }
    epg.set(meta.id, programmes);
  }

  return { channels, epg };
};


