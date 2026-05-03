import "fake-indexeddb/auto";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: readonly number[] = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

/**
 * Helper to safely define a mock on a prototype if it might be missing
 * or to satisfy the linter that we know what we're doing.
 */
const defineMock = (obj: object, prop: string, value: unknown) => {
  Object.defineProperty(obj, prop, {
    configurable: true,
    writable: true,
    value,
  });
};

// Mock Picture-in-Picture API
defineMock(
  HTMLVideoElement.prototype,
  "requestPictureInPicture",
  vi.fn().mockResolvedValue({}),
);
defineMock(document, "exitPictureInPicture", vi.fn().mockResolvedValue({}));

// Mock Fullscreen API
defineMock(
  Element.prototype,
  "requestFullscreen",
  vi.fn().mockResolvedValue({}),
);
defineMock(document, "exitFullscreen", vi.fn().mockResolvedValue({}));

// Mock scrollIntoView
defineMock(Element.prototype, "scrollIntoView", vi.fn());

// Mock other HTMLMediaElement methods
defineMock(HTMLMediaElement.prototype, "pause", vi.fn());
defineMock(HTMLMediaElement.prototype, "load", vi.fn());

// Mock requestAnimationFrame/cancelAnimationFrame
globalThis.requestAnimationFrame = vi
  .fn()
  .mockImplementation((callback: FrameRequestCallback) => {
    callback(globalThis.performance.now());
    return 0;
  });
globalThis.cancelAnimationFrame = vi.fn();
