import type { ReaderSelectionAnchor } from "../domain/types";

type RectLike = Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">;

export function getVisibleCfiRangeAnchor(
  range: Range,
  visibleOuterBounds?: RectLike | null,
): ReaderSelectionAnchor | null {
  try {
    const doc = range.startContainer.ownerDocument;
    const view = doc?.defaultView;
    const frame = view?.frameElement;
    if (!view || !frame || typeof frame.getBoundingClientRect !== "function") return null;

    const frameRect = frame.getBoundingClientRect();
    const visibleLocalBounds = visibleOuterBounds
      ? toFrameLocalBounds(visibleOuterBounds, frameRect)
      : undefined;
    const rect = chooseVisibleRangeRect(
      Array.from(range.getClientRects()),
      range.getBoundingClientRect(),
      { width: view.innerWidth, height: view.innerHeight },
      visibleLocalBounds,
    );
    if (!rect) return null;
    const x = frameRect.left + rect.left + rect.width / 2;
    const y = frameRect.top + rect.top;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch {
    return null;
  }
}

export function chooseVisibleRangeRect(
  clientRects: RectLike[],
  boundingRect: RectLike | null,
  viewport: { width: number; height: number },
  visibleBounds?: Pick<RectLike, "bottom" | "left" | "right" | "top">,
): RectLike | null {
  const bounds = {
    left: Math.max(0, visibleBounds?.left ?? 0),
    top: Math.max(0, visibleBounds?.top ?? 0),
    right: Math.min(viewport.width, visibleBounds?.right ?? viewport.width),
    bottom: Math.min(viewport.height, visibleBounds?.bottom ?? viewport.height),
  };
  const nonzero = clientRects.filter(isNonzeroRect);
  const visible = nonzero.find((rect) => intersectsBounds(rect, bounds));
  if (visible) return visible;
  return boundingRect && isNonzeroRect(boundingRect) && intersectsBounds(boundingRect, bounds)
    ? boundingRect
    : null;
}

function isNonzeroRect(rect: RectLike): boolean {
  return rect.width > 0 && rect.height > 0;
}

function intersectsBounds(
  rect: RectLike,
  bounds: Pick<RectLike, "bottom" | "left" | "right" | "top">,
): boolean {
  return rect.right > bounds.left
    && rect.bottom > bounds.top
    && rect.left < bounds.right
    && rect.top < bounds.bottom;
}

function toFrameLocalBounds(outer: RectLike, frame: RectLike) {
  return {
    left: outer.left - frame.left,
    top: outer.top - frame.top,
    right: outer.right - frame.left,
    bottom: outer.bottom - frame.top,
  };
}
