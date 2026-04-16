import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import App from "../src/App";

// Mock Player so we don't need to load WASM/HLS etc.
vi.mock("../src/Player", () => ({
  default: () => <div data-testid="player-mock">Player</div>,
}));

describe("App Component", () => {
  it("renders without crashing and shows the player", () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId("player-mock")).toBeDefined();
  });
});
