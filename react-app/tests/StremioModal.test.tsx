import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StremioModal from "../src/components/StremioModal";

// Mock package.json
vi.mock("../../package.json", () => ({
  default: { version: "1.0.0" },
}));

// Mock clipboard
const mockClipboard = {
  writeText: vi.fn(() => Promise.resolve()),
};
Object.defineProperty(navigator, "clipboard", {
  value: mockClipboard,
  writable: true,
});

describe("StremioModal", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };

  it("should render Stremio-specific instructions or deep links", () => {
    render(<StremioModal {...defaultProps} />);
    expect(screen.getByText("Install Addon")).toBeDefined();
    expect(screen.getByText("Copy Install Link")).toBeDefined();
    expect(
      screen.getByText(/Install the official addon for Stremio/i),
    ).toBeDefined();
  });

  it("should close when the dismiss action is triggered", () => {
    render(<StremioModal {...defaultProps} />);
    const closeButton = screen.getByText("close");
    fireEvent.click(closeButton);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("should copy to clipboard when Copy Link is clicked", async () => {
    render(<StremioModal {...defaultProps} />);
    const copyButton = screen.getByText("Copy Install Link");
    fireEvent.click(copyButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();

    // Check for "Copied!" feedback
    const copiedText = await screen.findByText("Copied!");
    expect(copiedText).toBeDefined();
  });

  it("should navigate to stremio:// when Install is clicked", () => {
    const originalLocation = globalThis.location;
    const mockLocation = new URL("http://localhost");
    (mockLocation as unknown as Location).assign = vi.fn();

    vi.stubGlobal("location", mockLocation);

    render(<StremioModal {...defaultProps} />);
    const installButton = screen.getByText("Install Addon");
    fireEvent.click(installButton);

    expect(globalThis.location.href).toContain("stremio://");

    vi.stubGlobal("location", originalLocation);
  });
});
