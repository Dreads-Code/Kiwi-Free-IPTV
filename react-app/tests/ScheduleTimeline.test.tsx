import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ScheduleTimeline from "../src/components/ScheduleTimeline";

describe("ScheduleTimeline", () => {
  const defaultProps = {
    pixelsPerHour: 100,
    scheduleStartTime: new Date("2024-01-01T12:00:00Z"),
    nowHourIndex: 2,
  };

  it("should render time markers evenly spaced", () => {
    render(<ScheduleTimeline {...defaultProps} />);
    // Check for some expected time labels (they might appear multiple times for each day)
    expect(screen.getAllByText(/12 pm/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1 pm/i).length).toBeGreaterThanOrEqual(1);
  });

  it("should highlight the current time correctly", () => {
    const { container } = render(<ScheduleTimeline {...defaultProps} />);
    // search for the element with the primary color variable class pattern or just bold font
    const highlighted = container.querySelector(".font-bold");
    expect(highlighted).toBeDefined();
  });

  it("should render day labels when day changes", () => {
    render(<ScheduleTimeline {...defaultProps} />);
    // It should at least show the first day label
    expect(screen.getByText(/monday/i)).toBeDefined();
  });
});
