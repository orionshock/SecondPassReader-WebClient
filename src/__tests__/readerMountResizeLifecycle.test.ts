import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeReaderMountResize } from "../features/reader/shell/ReaderMountResize.Lifecycle";

describe("reader mount resize lifecycle", () => {
  let observerCallback: ResizeObserverCallback;
  let observerInstance: ResizeObserver;
  let nextFrameId: number;
  let frames: Map<number, FrameRequestCallback>;
  let observe: ReturnType<typeof vi.fn>;
  let disconnect: ReturnType<typeof vi.fn>;
  let cancelAnimationFrame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nextFrameId = 1;
    frames = new Map();
    observe = vi.fn();
    disconnect = vi.fn();
    cancelAnimationFrame = vi.fn((id: number) => frames.delete(id));

    vi.stubGlobal("window", {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        frames.set(id, callback);
        return id;
      },
      cancelAnimationFrame,
    });
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) {
        observerCallback = callback;
        observerInstance = this as unknown as ResizeObserver;
      }

      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("schedules resize after the observed mount size changes", () => {
    const element = {} as Element;
    const onResize = vi.fn();
    observeReaderMountResize(element, onResize);

    emitResize(element, 800, 600);
    expect(onResize).not.toHaveBeenCalled();
    runNextFrame();

    expect(observe).toHaveBeenCalledWith(element);
    expect(onResize).toHaveBeenCalledWith({ width: 800, height: 600 });
  });

  it("ignores unchanged, subpixel-equivalent, and zero sizes", () => {
    const element = {} as Element;
    const onResize = vi.fn();
    observeReaderMountResize(element, onResize);

    emitResize(element, 800.2, 600.2);
    runNextFrame();
    emitResize(element, 800.4, 600.4);
    runNextFrame();
    emitResize(element, 0, 600);

    expect(onResize).toHaveBeenCalledOnce();
  });

  it("coalesces rapid observer entries to the latest mount size", () => {
    const element = {} as Element;
    const onResize = vi.fn();
    observeReaderMountResize(element, onResize);

    emitResize(element, 800, 600);
    emitResize(element, 900, 650);
    emitResize(element, 1000, 700);
    expect(frames).toHaveLength(1);
    runNextFrame();

    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith({ width: 1000, height: 700 });
  });

  it("disconnects and cancels pending resize work during cleanup", () => {
    const element = {} as Element;
    const onResize = vi.fn();
    const cleanup = observeReaderMountResize(element, onResize);
    emitResize(element, 800, 600);

    cleanup();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(frames).toHaveLength(0);
    expect(onResize).not.toHaveBeenCalled();

    emitResize(element, 900, 700);
    expect(frames).toHaveLength(0);
  });

  function emitResize(target: Element, width: number, height: number): void {
    observerCallback([
      { target, contentRect: { width, height } } as ResizeObserverEntry,
    ], observerInstance);
  }

  function runNextFrame(): void {
    const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
    if (!entry) return;
    frames.delete(entry[0]);
    entry[1](0);
  }
});
