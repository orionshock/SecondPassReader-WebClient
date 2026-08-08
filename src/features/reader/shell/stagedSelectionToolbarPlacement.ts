import type { ReaderSelectionAnchor } from "../domain/types";
import type { StagedSelectionToolbarPosition } from "./stagedSelectionTypes";

export function getStagedSelectionToolbarPosition(input: {
  wrapper: Pick<DOMRect, "height" | "left" | "top" | "width">;
  anchor?: ReaderSelectionAnchor;
  fallback?: StagedSelectionToolbarPosition | null;
}): StagedSelectionToolbarPosition | null {
  if (!input.anchor) return input.fallback ?? null;
  const left = Math.max(12, Math.min(input.wrapper.width - 12, input.anchor.x - input.wrapper.left));
  const top = Math.max(0, Math.min(input.wrapper.height, input.anchor.y - input.wrapper.top));
  return { left, top, placement: top < 72 ? "below" : "above" };
}
