import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAllData } from "../src/services/tvService";

// Mock WASM module — parse_nz_channels returns RustChannelMeta[]
vi.mock("../src/wasm/iptv_nz_addon_rust.js", () => ({
  parse_nz_channels: vi.fn(),
  process_icon_url: vi.fn((url: string) => url),
  clean_show_title: vi.fn((title: string) => title),
}));

// Mock IndexedDB cache so tests don't leak state between runs
vi.mock("../src/utils/indexedDb.js", () => ({
  epgCache: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {
      /* no-op */
    }),
  },
}));

import * as wasmModule from "../src/wasm/iptv_nz_addon_rust.js";

const mockRustData = [
  {
    id: "test-channel-1",
    name: "Test Channel 1",
    logo: "https://logo.com/1.png",
    url: "https://stream.com/1.m3u8",
    category: "Entertainment",
    description: "Channel 1 description",
    programmes: [
      {
        start: "20240728000000 +1200",
        stop: "20240728010000 +1200",
        channel: "test-channel-1",
        title: "Programme 1",
        desc: "Desc 1",
        icon: { src: "https://icon.com/1.jpg" },
        category: ["Movie"],
        rating: { value: "PG" },
      },
    ],
  },
];

describe("tvService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.clearAllMocks();
    vi.mocked(wasmModule.parse_nz_channels).mockReturnValue(mockRustData);
  });

  describe("fetchAllData", () => {
    it("should fetch m3u8 and EPG, parse via WASM, and return channels + epg", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("#EXTM3U"),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("<tv></tv>"),
        } as Response);

      const result = await fetchAllData();

      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].id).toBe("test-channel-1");
      expect(result.channels[0].name).toBe("Test Channel 1");
      expect(result.channels[0].category).toBe("Entertainment");

      expect(result.epg.has("test-channel-1")).toBe(true);
      const programmes = result.epg.get("test-channel-1");
      expect(programmes).toBeDefined();
      expect(programmes?.[0].title).toBe("Programme 1");
      expect(programmes?.[0].rating).toBe("PG");
      expect(programmes?.[0].start).toBeInstanceOf(Date);
      expect(programmes?.[0].stop).toBeInstanceOf(Date);
    });

    it("should throw if either fetch response is not ok", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        } as Response)
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") } as Response);

      await expect(fetchAllData()).rejects.toThrow(
        "Failed to fetch data from source",
      );
    });

    it("should filter out programmes with invalid start or stop dates", async () => {
      vi.mocked(wasmModule.parse_nz_channels).mockReturnValue([
        {
          id: "test-channel-1",
          name: "Test Channel 1",
          url: "https://stream.com/1.m3u8",
          category: "Entertainment",
          description: "",
          programmes: [
            {
              start: "invalid-date",
              stop: "20240728010000 +1200",
              channel: "test-channel-1",
              title: "Invalid Start",
            },
            {
              start: "20240728000000 +1200",
              stop: "",
              channel: "test-channel-1",
              title: "Invalid Stop",
            },
          ],
        },
      ]);

      vi.mocked(fetch)
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") } as Response)
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") } as Response);

      const result = await fetchAllData();
      expect(result.epg.get("test-channel-1")).toHaveLength(0);
    });

    it("should return null in parseEpgDate on malformed numerical data in string", async () => {
      vi.mocked(wasmModule.parse_nz_channels).mockReturnValue([
        {
          id: "test-channel-1",
          name: "Test Channel 1",
          url: "https://stream.com/1.m3u8",
          category: "Entertainment",
          description: "",
          programmes: [
            {
              // String with length >= 20 but invalid numerical segments
              start: "Not-A-Valid-Date-String-At-All",
              stop: "20240728010000 +1200",
              channel: "test-channel-1",
              title: "Malformed String Test",
            },
          ],
        },
      ]);

      vi.mocked(fetch)
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") } as Response)
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") } as Response);

      const result = await fetchAllData();
      // Should handle the error via isNaN checks and return null, resulting in the programme being filtered out
      expect(result.epg.get("test-channel-1")).toHaveLength(0);
    });
  });
});
