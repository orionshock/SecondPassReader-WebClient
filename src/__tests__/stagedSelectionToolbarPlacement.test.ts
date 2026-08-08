import { describe, expect, it } from "vitest";

import { getStagedSelectionToolbarPosition } from "../features/reader/shell/stagedSelectionToolbarPlacement";

describe("staged selection toolbar placement", () => {
  const wrapper = { left: 100, top: 50, width: 600, height: 400 } as DOMRect;

  it("keeps natural selection anchors near the selected text", () => {
    expect(getStagedSelectionToolbarPosition({ wrapper, anchor: { x: 350, y: 250 } })).toEqual({
      left: 250,
      top: 200,
      placement: "above",
    });
  });

  it("uses the supplied stable fallback when measurement is unavailable", () => {
    const fallback = { left: 300, top: 18, placement: "below" as const };
    expect(getStagedSelectionToolbarPosition({ wrapper, fallback })).toEqual(fallback);
  });
});
