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

/**
 * Fetches consolidated channel and EPG data from our own backend.
 * This replaces direct MJH fetching and browser-side XML parsing.
 */
export const fetchAllData = async (): Promise<{
  channels: Channel[];
  epg: EpgData;
}> => {
  const response = await fetch("/api/data");
  if (!response.ok) {
    throw new Error(
      `Failed to fetch consolidated data: ${response.statusText}`,
    );
  }

  const rustData = (await response.json()) as RustChannelMeta[];

  const channels: Channel[] = [];
  const epg: EpgData = new Map();

  for (const meta of rustData) {
    const channel: Channel = {
      id: meta.id,
      name: meta.name,
      logo: meta.logo ?? "",
      url: meta.url,
      epg_id: meta.id,
      category: meta.category as Channel["category"],
      headers: meta.http_headers,
    };

    channels.push(channel);

    const programmes = meta.programmes
      .map((p): Programme | null => {
        const start = parseEpgDate(p.start);
        const stop = parseEpgDate(p.stop);
        if (!start || !stop) return null;

        return {
          channelId: meta.id,
          start,
          stop,
          startMs: start.getTime(),
          stopMs: stop.getTime(),
          title: p.title ?? "No Title",
          description: p.desc ?? meta.description,
          rating: p.rating?.value,
          icon: p.icon?.src,
          categories: p.category,
          date: p.date,
          starRating: p.star_rating?.value,
        } as Programme;
      })
      .filter((p): p is Programme => p !== null);

    epg.set(meta.id, programmes);
  }

  return { channels, epg };
};

// Deprecated exports for backward compatibility during transition
export const fetchChannels = async () => (await fetchAllData()).channels;
export const fetchEpg = async () => (await fetchAllData()).epg;
