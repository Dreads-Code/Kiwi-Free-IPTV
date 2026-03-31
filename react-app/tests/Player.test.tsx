import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --------------------------------------------------------------------------
// Mocks for lazy-loaded components
// --------------------------------------------------------------------------
vi.mock("../src/components/VideoPlayer", () => ({
  default: () => <div data-testid="video-player">VideoPlayer</div>,
}));
vi.mock("../src/components/ScheduleModal", () => ({
  default: () => <div data-testid="schedule-modal">ScheduleModal</div>,
}));
vi.mock("../src/components/StremioModal", () => ({
  default: () => <div data-testid="stremio-modal">StremioModal</div>,
}));
vi.mock("../src/components/ChannelList", () => ({
  default: () => <div data-testid="channel-deck">ChannelDeck</div>,
}));
vi.mock("../src/components/HeroModal", () => ({
  default: () => null,
}));

// --------------------------------------------------------------------------
// Mock tvService to control data loading
// --------------------------------------------------------------------------
vi.mock("../src/services/tvService", () => ({
  fetchAllData: vi.fn(),
}));

// --------------------------------------------------------------------------
// Mock wasm module
// --------------------------------------------------------------------------
vi.mock("../wasm/iptv_nz_addon_rust.js", () => ({
  is_safe_proxy_url: vi.fn(() => false),
  clean_show_title: vi.fn((t: string) => t),
  process_icon_url: vi.fn((u: string) => u),
}));

import Player from "../src/Player";
import { fetchAllData } from "../src/services/tvService";

// --------------------------------------------------------------------------

describe("Player – error path coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Player.tsx:196 – loadData() catch block
  // When fetchAllData() rejects, the catch should set an error message and
  // setLoading(false) without crashing.
  // -------------------------------------------------------------------------
  describe("loadData catch block (line 196)", () => {
    it("should display an error message when fetchAllData rejects with an Error", async () => {
      vi.mocked(fetchAllData).mockRejectedValueOnce(
        new Error("Failed to fetch channel data"),
      );

      render(<Player />);

      await waitFor(
        () => {
          expect(screen.getByRole("alert")).toBeDefined();
        },
        { timeout: 5000 },
      );

      expect(screen.getByText(/Failed to fetch channel data/i)).toBeDefined();
    });

    it("should display a generic message when fetchAllData rejects with a non-Error", async () => {
      vi.mocked(fetchAllData).mockRejectedValueOnce("unexpected string error");

      render(<Player />);

      await waitFor(
        () => {
          expect(screen.getByRole("alert")).toBeDefined();
        },
        { timeout: 5000 },
      );

      expect(screen.getByText(/An unknown error occurred/i)).toBeDefined();
    });

    it("should allow retrying after a load failure", async () => {
      const successData = {
        channels: [
          {
            id: "ch1",
            name: "Test Channel",
            logo: "",
            url: "https://example.com/stream.m3u8",
            epg_id: "ch1",
            category: "News" as const,
            headers: {},
          },
        ],
        epg: new Map(),
      };

      // First call fails, second succeeds
      vi.mocked(fetchAllData)
        .mockRejectedValueOnce(new Error("Temporary network error"))
        .mockResolvedValueOnce(successData);

      render(<Player />);

      // Wait for the error state
      await waitFor(() => expect(screen.getByRole("alert")).toBeDefined(), {
        timeout: 5000,
      });

      // Click the Retry button
      const retryButton = screen.getByRole("button", { name: /retry/i });
      await userEvent.click(retryButton);

      // fetchAllData should have been called twice
      await waitFor(
        () => {
          expect(fetchAllData).toHaveBeenCalledTimes(2);
        },
        { timeout: 5000 },
      );
    });
  });
});
