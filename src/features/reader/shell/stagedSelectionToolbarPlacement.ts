import type { ReaderSelectionAnchor } from "../domain/types";
import type { StagedSelectionToolbarPosition } from "./stagedSelectionTypes";

export type StagedSelectionToolbarSize = {
  width: number;
  height: number;
};

const DEFAULT_TOOLBAR_SIZE: StagedSelectionToolbarSize = { width: 360, height: 58 };
const TOOLBAR_GAP = 10;
const TOOLBAR_MARGIN = 8;

export function getStagedSelectionToolbarPosition(input: {
  wrapper: Pick<DOMRect, "height" | "left" | "top" | "width">;
  anchor?: ReaderSelectionAnchor;
  fallback?: StagedSelectionToolbarPosition | null;
  toolbarSize?: StagedSelectionToolbarSize;
  viewport?: Pick<DOMRect, "height" | "left" | "top" | "width">;
}): StagedSelectionToolbarPosition | null {
  const desired = input.anchor
    ? {
        left: input.anchor.x - input.wrapper.left,
        top: input.anchor.y - input.wrapper.top,
        placement: "above" as const,
      }
    : input.fallback;
  if (!desired) return null;

  const visible = getVisibleWrapperBounds(input.wrapper, input.viewport);
  const toolbar = input.toolbarSize ?? DEFAULT_TOOLBAR_SIZE;
  const usableWidth = Math.max(0, visible.right - visible.left - TOOLBAR_MARGIN * 2);
  const usableHeight = Math.max(0, visible.bottom - visible.top - TOOLBAR_MARGIN * 2);
  const width = Math.min(Math.max(0, toolbar.width), usableWidth);
  const height = Math.min(Math.max(0, toolbar.height), usableHeight);
  const minLeft = visible.left + TOOLBAR_MARGIN + width / 2;
  const maxLeft = visible.right - TOOLBAR_MARGIN - width / 2;
  const left = clamp(desired.left, minLeft, maxLeft);

  const minVisualTop = visible.top + TOOLBAR_MARGIN;
  const maxVisualTop = visible.bottom - TOOLBAR_MARGIN - height;
  const aboveVisualTop = desired.top - TOOLBAR_GAP - height;
  const belowVisualTop = desired.top + TOOLBAR_GAP;
  const aboveFits = aboveVisualTop >= minVisualTop && aboveVisualTop <= maxVisualTop;
  const belowFits = belowVisualTop >= minVisualTop && belowVisualTop <= maxVisualTop;
  const aboveSpace = desired.top - TOOLBAR_GAP - minVisualTop;
  const belowSpace = visible.bottom - TOOLBAR_MARGIN - desired.top - TOOLBAR_GAP;
  const placement = aboveFits
    ? "above"
    : belowFits
      ? "below"
      : input.anchor
        ? aboveSpace >= belowSpace ? "above" : "below"
        : desired.placement;
  const visualTop = clamp(
    placement === "above" ? aboveVisualTop : belowVisualTop,
    minVisualTop,
    maxVisualTop,
  );
  const top = placement === "above"
    ? visualTop + height + TOOLBAR_GAP
    : visualTop - TOOLBAR_GAP;

  return { left, top, placement };
}

function getVisibleWrapperBounds(
  wrapper: Pick<DOMRect, "height" | "left" | "top" | "width">,
  viewport?: Pick<DOMRect, "height" | "left" | "top" | "width">,
) {
  if (!viewport) return { left: 0, top: 0, right: wrapper.width, bottom: wrapper.height };
  return {
    left: Math.max(0, viewport.left - wrapper.left),
    top: Math.max(0, viewport.top - wrapper.top),
    right: Math.min(wrapper.width, viewport.left + viewport.width - wrapper.left),
    bottom: Math.min(wrapper.height, viewport.top + viewport.height - wrapper.top),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}
