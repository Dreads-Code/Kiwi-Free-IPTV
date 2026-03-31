import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CustomVideoControls from "../src/components/CustomVideoControls";

describe("CustomVideoControls", () => {
  const defaultProps = {
    isVisible: true,
    isPlaying: false,
    onPlayPause: vi.fn(),
    volume: 1,
    isMuted: false,
    onVolumeChange: vi.fn(),
    onMuteToggle: vi.fn(),
    currentTime: 100,
    duration: 1000,
    onSeek: vi.fn(),
    isFullscreen: false,
    onFullscreenToggle: vi.fn(),
    isCastAvailable: false,
    onCast: vi.fn(),
    channelName: "Test Channel",
    programmeTitle: "Test Programme",
    subtitleTracks: [],
    currentSubtitleTrack: -1,
    onSubtitleChange: vi.fn(),
    qualities: [],
    currentQuality: -1,
    onQualityChange: vi.fn(),
    isPipAvailable: false,
    onPipToggle: vi.fn(),
  };

  it("should render play/pause, volume, fullscreen, and info correctly", () => {
    render(<CustomVideoControls {...defaultProps} />);

    expect(screen.getByText("Test Channel")).toBeDefined();
    expect(screen.getByText("Test Programme")).toBeDefined();
    expect(screen.getByRole("button", { name: "Play" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Mute" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Enter fullscreen" }),
    ).toBeDefined();
  });

  it("should correctly toggle play/pause icon", () => {
    const { rerender } = render(
      <CustomVideoControls {...defaultProps} isPlaying={true} />,
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();

    rerender(<CustomVideoControls {...defaultProps} isPlaying={false} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeDefined();
  });

  it("should call onPlayPause when play button clicked", () => {
    render(<CustomVideoControls {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(defaultProps.onPlayPause).toHaveBeenCalled();
  });

  it("should call onMuteToggle when volume button clicked", () => {
    render(<CustomVideoControls {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(defaultProps.onMuteToggle).toHaveBeenCalled();
  });

  it("should show seek bar progress correctly", () => {
    const { container } = render(
      <CustomVideoControls
        {...defaultProps}
        currentTime={500}
        duration={1000}
      />,
    );
    const slider = container.querySelector('input[type="range"]');
    expect(slider).toBeDefined();
    expect((slider as HTMLInputElement).value).toBe("500");
  });

  it("should call onSeek when bar moved", () => {
    render(<CustomVideoControls {...defaultProps} />);
    // There are two sliders: Seek and Volume. Seek is usually the first one or has specific class.
    const sliders = screen.getAllByRole("slider");
    const seekSlider = sliders[0];
    fireEvent.change(seekSlider, { target: { value: "200" } });
    expect(defaultProps.onSeek).toHaveBeenCalledWith(200);
  });
});
