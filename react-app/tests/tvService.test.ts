import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchAllData,
} from "../src/services/tvService";

// Mock global fetch
vi.stubGlobal("fetch", vi.fn());

describe("tvService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchAllData", () => {
    it("should fetch data from /api/data and successfully parse it", async () => {
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

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockRustData,
      } as Response);

      const result = await fetchAllData();

      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].id).toBe("test-channel-1");
      expect(result.channels[0].name).toBe("Test Channel 1");
      expect(result.channels[0].category).toBe("Entertainment");

      expect(result.epg.has("test-channel-1")).toBe(true);
      const programmes = result.epg.get("test-channel-1");
      expect(programmes).toHaveLength(1);
      expect(programmes![0].title).toBe("Programme 1");
      expect(programmes![0].rating).toBe("PG");
      expect(programmes![0].start).toBeInstanceOf(Date);
      expect(programmes![0].stop).toBeInstanceOf(Date);
    });

    it("should throw an error if the fetch response is not ok", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        statusText: "Internal Server Error",
      } as Response);

      await expect(fetchAllData()).rejects.toThrow(
        "Failed to fetch consolidated data: Internal Server Error",
      );
    });

    it("should correctly filter out programmes with invalid start/stop dates", async () => {
      const mockRustData = [
        {
          id: "test-channel-1",
          name: "Test Channel 1",
          url: "https://stream.com/1.m3u8",
          category: "Entertainment",
          description: "Channel 1 description",
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
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockRustData,
      } as Response);

      const result = await fetchAllData();
      expect(result.epg.get("test-channel-1")).toHaveLength(0);
    });
  });


});
