import { describe, it, expect } from "vitest";

describe("Base64 Environment", () => {
  it("should have btoa and atob working", () => {
    const original = "Hello World";
    const encoded = btoa(original);
    const decoded = atob(encoded);
    expect(decoded).toBe(original);
  });
});
