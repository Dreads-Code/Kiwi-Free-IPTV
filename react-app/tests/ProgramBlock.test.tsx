import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProgramBlock from "../src/components/ProgramBlock";
import { Programme } from "../src/types";

describe("ProgramBlock", () => {
  const mockProgramme: Programme = {
    title: "Test Show",
    description: "Test description",
    startMs: Date.now(),
    stopMs: Date.now() + 3_600_000,
    start: new Date(),
    stop: new Date(Date.now() + 3_600_000),
    channelId: "1",
    categories: ["Movie"],
    rating: "G",
  };

  const defaultProps = {
    programme: mockProgramme,
    pixelsPerHour: 200,
    scheduleStartTime: new Date(Date.now()),
    onSelect: vi.fn(),
  };

  it("should render title correctly", () => {
    render(<ProgramBlock {...defaultProps} />);
    expect(screen.getByText("Test Show")).toBeDefined();
  });

  it("should call onSelect when clicked", () => {
    render(<ProgramBlock {...defaultProps} />);
    fireEvent.click(screen.getByRole("button"));
    expect(defaultProps.onSelect).toHaveBeenCalled();
  });

  it("should calculate position and height correctly", () => {
    const startTime = new Date("2024-01-01T12:00:00Z");
    const programme = {
      ...mockProgramme,
      startMs: startTime.getTime(),
      stopMs: startTime.getTime() + 3_600_000, // 1 hour
    };

    // Grid starts exactly at programme start
    const { container } = render(
      <ProgramBlock
        {...defaultProps}
        programme={programme}
        scheduleStartTime={startTime}
        pixelsPerHour={100}
      />,
    );

    const block = container.querySelector('div[role="button"]');
    expect((block as HTMLElement).style.top).toBe("0px");
    // Height is pixelsPerHour * hours - 2 (as per code)
    expect((block as HTMLElement).style.height).toBe("98px");
  });

  it("should display rating badge if space allows", () => {
    render(<ProgramBlock {...defaultProps} />);
    expect(screen.getByText("G")).toBeDefined();
  });
});
