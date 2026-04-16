import { describe, it, expect, beforeEach } from "vitest";
import { epgCache } from "../src/utils/indexedDb";

describe("IndexedDbCache", () => {
  beforeEach(async () => {
    // Clear the database before each test
    // Note: in fake-indexeddb environment, we can just let it be or delete the database
    // But testing the singleton's behavior is enough.
  });

  it("should store and retrieve data", async () => {
    const testId = "test-epg";
    const testData = "<tv>EPG Data</tv>";

    await epgCache.set(testId, testData);
    const retrieved = await epgCache.get(testId, 1000 * 60); // 1 minute max age

    expect(retrieved).toBe(testData);
  });

  it("should return null for non-existent keys", async () => {
    const retrieved = await epgCache.get("missing", 1000 * 60);
    expect(retrieved).toBeNull();
  });

  it("should return null for expired data", async () => {
    const testId = "expire-me";
    const testData = "old data";

    await epgCache.set(testId, testData);

    // Simulate passage of time by passing a tiny maxAge
    const retrieved = await epgCache.get(testId, -1);
    expect(retrieved).toBeNull();
  });
});
