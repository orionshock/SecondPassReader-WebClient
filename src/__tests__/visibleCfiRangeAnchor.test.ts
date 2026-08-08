import { describe, expect, it } from "vitest";

import {
  chooseVisibleRangeRect,
  getVisibleCfiRangeAnchor,
} from "../features/reader/engine/visibleCfiRangeAnchor";

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

    expect(getVisibleCfiRangeAnchor(range)).toEqual({ x: 160, y: 230 });
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
