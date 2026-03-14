import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

describe("Simple Component Test", () => {
  it("should render a div", () => {
    render(<div>Hello</div>);
    expect(screen.getByText("Hello")).toBeDefined();
  });
});
