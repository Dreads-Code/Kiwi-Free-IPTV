import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ScheduleModal from "../src/components/ScheduleModal";
import { Channel, EpgData } from "../src/types";

// Mock child components to simplify testing ScheduleModal's logic
vi.mock("../src/components/ScheduleTimeline", () => ({
  default: () => <div data-testid="timeline">Timeline</div>,
}));
vi.mock("../src/components/ScheduleGrid", () => ({
  default: () => <div data-testid="grid">Grid</div>,
}));

describe("ScheduleModal", () => {
  const mockChannels: Channel[] = [
    {
      id: "1",
      name: "Channel 1",
      epg_id: "1",
      logo: "logo1.png",
      url: "https://example.com/stream1",
      category: "New Zealand",
    },
  ];
  const mockEpg: EpgData = new Map();

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    channels: mockChannels,
    epg: mockEpg,
    onProgrammeSelect: vi.fn(),
  };

  it("should render detailed information about a selected programme", () => {
    render(<ScheduleModal {...defaultProps} />);
    expect(screen.getByText("7-Day Schedule")).toBeDefined();
    expect(screen.getByTestId("timeline")).toBeDefined();
    expect(screen.getByTestId("grid")).toBeDefined();
  });

  it("should trigger the close action when dismissed", () => {
    render(<ScheduleModal {...defaultProps} />);
    const closeButton = screen.getByLabelText("Close schedule");
    fireEvent.click(closeButton);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("should return null if isOpen is false", () => {
    const { container } = render(
      <ScheduleModal {...defaultProps} isOpen={false} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
