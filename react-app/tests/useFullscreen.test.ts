import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFullscreen } from "../src/hooks/useFullscreen";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeVideoRef(overrides: Record<string, unknown> = {}) {
  return { current: overrides as unknown as HTMLVideoElement };
}

function makeContainerRef(overrides: Record<string, unknown> = {}) {
  return { current: overrides as unknown as HTMLDivElement };
}

// --------------------------------------------------------------------------

describe("useFullscreen – core functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal("screen", {
      orientation: {
        unlock: vi.fn(),
        lock: vi.fn().mockResolvedValue(),
      },
    });

    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(document, "exitFullscreen", {
      value: vi.fn().mockResolvedValue(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      writable: true,
      configurable: true,
    });
  });

  it("starts with isFullscreen=false and isCastAvailable=false", () => {
    const videoRef = makeVideoRef();
    const containerRef = makeContainerRef();
    const { result } = renderHook(() => useFullscreen(containerRef, videoRef));

    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.isCastAvailable).toBe(false);
  });

  it("handleFullscreenToggle() requests fullscreen when not in fullscreen", async () => {
    const container = {
      requestFullscreen: vi.fn().mockResolvedValue(),
    } as unknown as HTMLDivElement;
    const containerRef = { current: container };
    const videoRef = makeVideoRef();

    const { result } = renderHook(() => useFullscreen(containerRef, videoRef));

    await act(async () => {
      await result.current.handleFullscreenToggle();
    });

    expect(container.requestFullscreen).toHaveBeenCalled();
  });

  it("handleFullscreenToggle() calls exitFullscreen when already in fullscreen", async () => {
    Object.defineProperty(document, "fullscreenElement", {
      value: document.body,
      writable: true,
      configurable: true,
    });

    const containerRef = makeContainerRef();
    const videoRef = makeVideoRef();

    const { result } = renderHook(() => useFullscreen(containerRef, videoRef));

    await act(async () => {
      await result.current.handleFullscreenToggle();
    });

    expect(document.exitFullscreen).toHaveBeenCalled();
  });

  it("fullscreenchange event updates isFullscreen state to true when entering", () => {
    const videoRef = makeVideoRef();
    const containerRef = makeContainerRef();
    const { result } = renderHook(() => useFullscreen(containerRef, videoRef));

    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: document.body,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.isFullscreen).toBe(true);
  });

  it("fullscreenchange event updates isFullscreen state to false when exiting", () => {
    const videoRef = makeVideoRef();
    const containerRef = makeContainerRef();
    const { result } = renderHook(() => useFullscreen(containerRef, videoRef));

    // Enter fullscreen first
    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: document.body,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.isFullscreen).toBe(true);

    // Exit fullscreen
    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: null,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.isFullscreen).toBe(false);
  });

  it("handleCast() calls webkitShowPlaybackTargetPicker when available", () => {
    const picker = vi.fn();
    const videoEl = {
      webkitShowPlaybackTargetPicker: picker,
    } as unknown as HTMLVideoElement;
    const videoRef = { current: videoEl };
    const containerRef = makeContainerRef();

    const { result } = renderHook(() => useFullscreen(containerRef, videoRef));

    act(() => {
      result.current.handleCast();
    });

    expect(picker).toHaveBeenCalled();
  });

  it("handleCast() does nothing when video ref is null", () => {
    const videoRef = { current: null };
    const containerRef = makeContainerRef();

    const { result } = renderHook(() =>
      useFullscreen(
        containerRef,
        videoRef as unknown as { current: HTMLVideoElement | null },
      ),
    );

    // Should not throw
    expect(() => {
      act(() => {
        result.current.handleCast();
      });
    }).not.toThrow();
  });

  it("removes fullscreenchange listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
    const videoRef = makeVideoRef();
    const containerRef = makeContainerRef();

    const { unmount } = renderHook(() => useFullscreen(containerRef, videoRef));
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "fullscreenchange",
      expect.any(Function),
    );
  });
});

describe("useFullscreen – error path coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Stub screen.orientation so spyOn can find it
    vi.stubGlobal("screen", {
      orientation: {
        unlock: vi.fn(),
        lock: vi.fn().mockResolvedValue(),
      },
    });

    // Stub document.fullscreenElement (read-only in jsdom)
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      writable: true,
      configurable: true,
    });

    // Stub document.exitFullscreen
    Object.defineProperty(document, "exitFullscreen", {
      value: vi.fn().mockResolvedValue(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // useFullscreen.ts:37  screen.orientation.unlock() throws on fullscreenchange
  // -------------------------------------------------------------------------
  describe("handleFullscreenChange – orientation unlock catch (line 37)", () => {
    it("should swallow errors thrown by screen.orientation.unlock() when exiting fullscreen", () => {
      // Make unlock throw
      (
        screen.orientation.unlock as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        throw new Error("unlock not supported");
      });

      const videoRef = makeVideoRef();
      const containerRef = makeContainerRef();

      renderHook(() => useFullscreen(containerRef, videoRef));

      // Simulate fullscreenchange where we exit (fullscreenElement = null)
      // screen.orientation.unlock() should throw but be caught silently
      expect(() => {
        document.dispatchEvent(new Event("fullscreenchange"));
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // useFullscreen.ts:52  remote.watchAvailability().catch() (line 52)
  // -------------------------------------------------------------------------
  describe("watchAvailability rejection catch (line 52)", () => {
    it("should set isCastAvailable to false when watchAvailability promise rejects", async () => {
      const rejectedPromise = Promise.reject(new Error("cast not available"));
      // Prevent unhandled rejection noise in test
      rejectedPromise.catch(() => {});

      const mockRemote = {
        watchAvailability: vi.fn().mockReturnValue(rejectedPromise),
      };

      const videoEl = { remote: mockRemote } as unknown as HTMLVideoElement;
      const videoRef = { current: videoEl };
      const containerRef = makeContainerRef();

      const { result } = renderHook(() =>
        useFullscreen(containerRef, videoRef),
      );

      await act(async () => {
        await rejectedPromise.catch(() => {});
      });

      expect(result.current.isCastAvailable).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // useFullscreen.ts:86  orientation.lock() inner catch inside toggle
  // -------------------------------------------------------------------------
  describe("handleFullscreenToggle – orientation lock inner catch (line 86)", () => {
    it("should log info and continue when orientation.lock() fails", async () => {
      const consoleInfoSpy = vi
        .spyOn(console, "info")
        .mockImplementation(() => {});

      const container = {
        requestFullscreen: vi.fn().mockResolvedValue(),
      } as unknown as HTMLDivElement;
      const containerRef = { current: container };
      const videoRef = makeVideoRef();

      // Make orientation.lock reject
      (
        screen.orientation as unknown as { lock: ReturnType<typeof vi.fn> }
      ).lock.mockRejectedValue(new Error("orientation lock failed"));

      const { result } = renderHook(() =>
        useFullscreen(containerRef, videoRef),
      );

      await act(async () => {
        await result.current.handleFullscreenToggle();
      });

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("Orientation lock failed"),
        expect.any(Error),
      );
      consoleInfoSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // useFullscreen.ts:93  outer fullscreen try/catch
  // -------------------------------------------------------------------------
  describe("handleFullscreenToggle – outer catch (line 93)", () => {
    it("should log error when requestFullscreen() rejects", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const container = {
        requestFullscreen: vi
          .fn()
          .mockRejectedValue(new Error("fullscreen denied")),
      } as unknown as HTMLDivElement;
      const containerRef = { current: container };
      const videoRef = makeVideoRef();

      const { result } = renderHook(() =>
        useFullscreen(containerRef, videoRef),
      );

      await act(async () => {
        await result.current.handleFullscreenToggle();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Fullscreen toggle failed"),
        expect.any(Error),
      );
      consoleErrorSpy.mockRestore();
    });

    it("should log error when exitFullscreen() rejects", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const containerRef = makeContainerRef();
      const videoRef = makeVideoRef();

      // Simulate being in fullscreen
      Object.defineProperty(document, "fullscreenElement", {
        value: document.body,
        writable: true,
        configurable: true,
      });
      (document.exitFullscreen as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("exit denied"),
      );

      const { result } = renderHook(() =>
        useFullscreen(containerRef, videoRef),
      );

      await act(async () => {
        await result.current.handleFullscreenToggle();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Fullscreen toggle failed"),
        expect.any(Error),
      );

      // Reset
      Object.defineProperty(document, "fullscreenElement", {
        value: null,
        writable: true,
        configurable: true,
      });
      consoleErrorSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // useFullscreen.ts:106  remote.prompt().catch() (line 106)
  // -------------------------------------------------------------------------
  describe("handleCast – remote.prompt() rejection catch (line 106)", () => {
    it("should log error when remote.prompt() rejects", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      let capturedCallback: ((available: boolean) => void) | null = null;
      const rejectedPrompt = Promise.reject(new Error("cast prompt failed"));
      rejectedPrompt.catch(() => {}); // prevent unhandled rejection

      const mockRemote = {
        watchAvailability: vi
          .fn()
          .mockImplementation((cb: (available: boolean) => void) => {
            capturedCallback = cb;
            return Promise.resolve(42);
          }),
        prompt: vi.fn().mockReturnValue(rejectedPrompt),
      };

      const videoEl = { remote: mockRemote } as unknown as HTMLVideoElement;
      const videoRef = { current: videoEl };
      const containerRef = makeContainerRef();

      const { result } = renderHook(() =>
        useFullscreen(containerRef, videoRef),
      );

      // Trigger isCastAvailable = true via the watchAvailability callback
      await act(async () => {
        capturedCallback?.(true);
      });

      // Now trigger cast prompt
      act(() => {
        result.current.handleCast();
      });

      await act(async () => {
        await rejectedPrompt.catch(() => {});
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Cast prompt failed"),
        expect.any(Error),
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
