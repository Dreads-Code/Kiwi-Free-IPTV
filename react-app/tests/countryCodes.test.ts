import { describe, it, expect } from "vitest";
import { countryCodeMap } from "../src/utils/countryCodes";

describe("countryCodes", () => {
  it("should return expected ISO codes for known country names", () => {
    expect(countryCodeMap["New Zealand"]).toBe("NZ");
    expect(countryCodeMap["United Kingdom"]).toBe("GB");
    expect(countryCodeMap["United States"]).toBe("US");
    expect(countryCodeMap["Australia"]).toBe("AU");
  });

  it("should return undefined for unknown country names", () => {
    expect(countryCodeMap["Narnia"]).toBeUndefined();
    expect(countryCodeMap["Unknown Country"]).toBeUndefined();
  });

  it("should have a reasonable number of mappings", () => {
    // Ensure we don't accidentally empty the map
    const keys = Object.keys(countryCodeMap);
    expect(keys.length).toBeGreaterThan(10);
  });
});
