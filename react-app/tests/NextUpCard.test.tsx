import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NextUpCard from "../src/components/NextUpCard";
import { Channel, Programme } from "../src/types";

// Mock the hook: useProgramImage
const mockUseProgramImage = vi.hoisted(() => vi.fn());
vi.mock("../src/hooks/useShowImage", () => ({
  useProgramImage: mockUseProgramImage,
}));

describe("NextUpCard", () => {
  const dummyChannel: Channel = {
    id: "stremio_iptv_id:mjh-tvnz-1",
    name: "TVNZ 1",
    logo: "https://logo.png",
    url: "https://stream.m3u8",
    epg_id: "mjh-tvnz-1",
    category: "New Zealand",
  };

  const dummyProgramme: Programme = {
    channelId: "stremio_iptv_id:mjh-tvnz-1",
    start: new Date("2026-05-30T21:00:00Z"),
    stop: new Date("2026-05-30T22:00:00Z"),
    startMs: 1_780_184_400_000,
    stopMs: 1_780_188_000_000,
    title: "Beautiful NZ",
    description: "A show about NZ",
  };

  it("renders nothing when no posterUrl", () => {
    mockUseProgramImage.mockReturnValue({ posterUrl: undefined });
    const { container } = render(
      <NextUpCard programme={dummyProgramme} channel={dummyChannel} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders image and title when posterUrl is present", () => {
    mockUseProgramImage.mockReturnValue({ posterUrl: "https://show.png" });
    const { container } = render(
      <NextUpCard programme={dummyProgramme} channel={dummyChannel} />,
    );

    expect(screen.getByText("Beautiful NZ")).toBeDefined();

    const imgElement = container.querySelector("img");
    expect(imgElement).toBeDefined();
    expect(imgElement?.getAttribute("src")).toBe("https://show.png");
    expect(imgElement?.getAttribute("alt")).toBe("Beautiful NZ");
  });
});
