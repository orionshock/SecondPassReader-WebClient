import { describe, expect, it } from "vitest";

import {
  chooseVisibleRangeRect,
  getVisibleCfiRangeAnchor,
  getVisibleRangeVerticalExtent,
} from "../features/reader/engine/EpubVisibleCfiRangeAnchor.Placement";

describe("visible CFI range anchor", () => {
  it("chooses the first visible nonzero client rect", () => {
    const zero = rect({ left: 1, top: 1, width: 0, height: 12 });
    const visible = rect({ left: 20, top: 30, width: 80, height: 14 });

    expect(chooseVisibleRangeRect([zero, visible], rect({ width: 200, height: 40 }), { width: 300, height: 200 })).toBe(visible);
  });

  it("falls back to the range bounding rect", () => {
    const bounding = rect({ left: 25, top: 35, width: 100, height: 20 });

    expect(chooseVisibleRangeRect([], bounding, { width: 300, height: 200 })).toBe(bounding);
  });

  it("rejects an offscreen column rect and chooses a later rect inside the reader mount", () => {
    const offscreen = rect({ left: 620, top: 30, width: 80, height: 14 });
    const visible = rect({ left: 120, top: 40, width: 100, height: 14 });

    expect(chooseVisibleRangeRect(
      [offscreen, visible],
      rect({ left: 120, top: 30, width: 580, height: 24 }),
      { width: 800, height: 400 },
      { left: 0, top: 0, right: 500, bottom: 400 },
    )).toBe(visible);
  });

  it("returns null when neither client nor bounding geometry intersects the reader mount", () => {
    const offscreen = rect({ left: 620, top: 30, width: 80, height: 14 });

    expect(chooseVisibleRangeRect(
      [offscreen],
      offscreen,
      { width: 800, height: 400 },
      { left: 0, top: 0, right: 500, bottom: 400 },
    )).toBeNull();
  });

  it("adds the iframe viewport offset", () => {
    const doc = {
      defaultView: {
        innerWidth: 500,
        innerHeight: 400,
        frameElement: { getBoundingClientRect: () => rect({ left: 100, top: 200, width: 500, height: 400 }) },
      },
    };
    const range = {
      startContainer: { ownerDocument: doc },
      getClientRects: () => [rect({ left: 20, top: 30, width: 80, height: 14 })],
      getBoundingClientRect: () => rect({ left: 20, top: 30, width: 80, height: 14 }),
    } as unknown as Range;

    expect(getVisibleCfiRangeAnchor(range)).toEqual({ x: 160, y: 230, bottom: 244 });
  });

  it("measures the full visible vertical extent of a multiline range", () => {
    const firstLine = rect({ left: 20, top: 30, width: 80, height: 14 });
    const lastLine = rect({ left: 20, top: 72, width: 120, height: 14 });

    expect(getVisibleRangeVerticalExtent(
      [firstLine, lastLine],
      firstLine,
      { width: 300, height: 200 },
    )).toEqual({ top: 30, bottom: 86 });
  });

  it("converts outer reader mount bounds before selecting iframe-local geometry", () => {
    const doc = {
      defaultView: {
        innerWidth: 900,
        innerHeight: 400,
        frameElement: { getBoundingClientRect: () => rect({ left: 100, top: 200, width: 900, height: 400 }) },
      },
    };
    const range = {
      startContainer: { ownerDocument: doc },
      getClientRects: () => [
        rect({ left: 700, top: 30, width: 80, height: 14 }),
        rect({ left: 120, top: 40, width: 100, height: 14 }),
      ],
      getBoundingClientRect: () => rect({ left: 120, top: 30, width: 660, height: 24 }),
    } as unknown as Range;
    const readerMount = rect({ left: 100, top: 200, width: 500, height: 400 });

    expect(getVisibleCfiRangeAnchor(range, readerMount)).toEqual({ x: 270, y: 240, bottom: 254 });
  });

  it("returns null when range geometry cannot be resolved", () => {
    const range = { startContainer: { ownerDocument: null } } as unknown as Range;
    expect(getVisibleCfiRangeAnchor(range)).toBeNull();
  });
});

function rect(overrides: Partial<DOMRect> = {}): DOMRect {
  const left = overrides.left ?? 0;
  const top = overrides.top ?? 0;
  const width = overrides.width ?? 0;
  const height = overrides.height ?? 0;
  return {
    bottom: overrides.bottom ?? top + height,
    height,
    left,
    right: overrides.right ?? left + width,
    top,
    width,
  } as DOMRect;
}
