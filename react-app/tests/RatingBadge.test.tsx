import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RatingBadge from "../src/components/RatingBadge";

describe("RatingBadge", () => {
  it("should render the correct rating text", () => {
    render(<RatingBadge rating="PG" />);
    expect(screen.getByText("PG")).toBeDefined();
  });

  it("should apply specific CSS classes based on the rating value", () => {
    const { rerender, container } = render(<RatingBadge rating="G" />);
    expect(container.firstChild?.className).toContain("emerald");

    rerender(<RatingBadge rating="PG" />);
    expect(container.firstChild?.className).toContain("sky");

    rerender(<RatingBadge rating="M" />);
    expect(container.firstChild?.className).toContain("amber");

    rerender(<RatingBadge rating="18+" />);
    expect(container.firstChild?.className).toContain("purple");
  });

  it('should not render if no rating is provided or it is "unrated"', () => {
    const { container, rerender } = render(<RatingBadge rating="" />);
    expect(container.firstChild).toBeNull();

    rerender(<RatingBadge rating="unrated" />);
    expect(container.firstChild).toBeNull();
  });

  it("should handle ratings with extra text", () => {
    render(<RatingBadge rating="16 (Violence)" />);
    expect(screen.getByText("16")).toBeDefined();
  });
});
