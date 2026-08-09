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

  it("clamps the complete toolbar horizontally inside the wrapper", () => {
    const size = { width: 200, height: 60 };
    const left = getStagedSelectionToolbarPosition({ wrapper, anchor: { x: 101, y: 250 }, toolbarSize: size });
    const right = getStagedSelectionToolbarPosition({ wrapper, anchor: { x: 699, y: 250 }, toolbarSize: size });

    expect(left?.left).toBe(108);
    expect(right?.left).toBe(492);
  });

  it("chooses below when placing above would clip", () => {
    expect(getStagedSelectionToolbarPosition({
      wrapper,
      anchor: { x: 350, y: 55 },
      toolbarSize: { width: 200, height: 60 },
    })).toEqual({ left: 250, top: 5, placement: "below" });
  });

  it("places below a multiline range's bottom edge instead of its first line", () => {
    expect(getStagedSelectionToolbarPosition({
      wrapper,
      anchor: { x: 350, y: 100, bottom: 180 },
      toolbarSize: { width: 200, height: 50 },
    })).toEqual({ left: 250, top: 130, placement: "below" });
  });

  it("clamps fallback geometry vertically inside the wrapper", () => {
    expect(getStagedSelectionToolbarPosition({
      wrapper,
      fallback: { left: 300, top: 800, placement: "below" },
      toolbarSize: { width: 200, height: 50 },
    })).toEqual({ left: 300, top: 332, placement: "below" });
  });

  it("replaces stale placement when a reflow supplies a fresh anchor", () => {
    const before = getStagedSelectionToolbarPosition({ wrapper, anchor: { x: 650, y: 250 } });
    const after = getStagedSelectionToolbarPosition({ wrapper, anchor: { x: 250, y: 250 } });

    expect(before?.left).toBe(412);
    expect(after?.left).toBe(188);
  });

  it("clamps a fallback when CFI measurement fails", () => {
    expect(getStagedSelectionToolbarPosition({
      wrapper,
      fallback: { left: -200, top: -200, placement: "below" },
      toolbarSize: { width: 200, height: 60 },
    })).toEqual({ left: 108, top: -2, placement: "below" });
  });
});
