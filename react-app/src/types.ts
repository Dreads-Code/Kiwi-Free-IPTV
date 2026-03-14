/**
 * Core type definitions for the IPTV application.
 * Defines the structure of Channels, Programmes, and EPG data maps.
 */
export interface Channel {
  id: string;
  name: string;
  logo: string;
  url: string;
  epg_id: string;
  network?: string;
  category: "New Zealand" | "International" | "Religious" | "Sports" | "News";
  headers?: Record<string, string>;
}

export interface Programme {
  channelId: string;
  start: Date;
  stop: Date;
  startMs: number;
  stopMs: number;
  title: string;
  description: string;
  rating?: string;

  // Visual assets and metadata
  icon?: string;
  categories?: string[];
  date?: string;
  episodeNum?: string;
  isNew?: boolean;
  actors?: string[];

  // Extended details
  country?: string;
  videoQuality?: string;
  audio?: string;
  subtitles?: string;
  starRating?: string;
}

export type EpgData = Map<string, Programme[]>;
