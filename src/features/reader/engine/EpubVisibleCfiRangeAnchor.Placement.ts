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
    const clientRects = Array.from(range.getClientRects());
    const viewport = { width: view.innerWidth, height: view.innerHeight };
    const rect = chooseVisibleRangeRect(
      clientRects,
      range.getBoundingClientRect(),
      viewport,
      visibleLocalBounds,
    );
    if (!rect) return null;
    const extent = getVisibleRangeVerticalExtent(clientRects, rect, viewport, visibleLocalBounds);
    const x = frameRect.left + rect.left + rect.width / 2;
    const y = frameRect.top + extent.top;
    const bottom = frameRect.top + extent.bottom;
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(bottom) ? { x, y, bottom } : null;
  } catch {
    return null;
  }
}

export function getVisibleRangeVerticalExtent(
  clientRects: RectLike[],
  fallbackRect: RectLike,
  viewport: { width: number; height: number },
  visibleBounds?: Pick<RectLike, "bottom" | "left" | "right" | "top">,
): { top: number; bottom: number } {
  const bounds = getVisibleBounds(viewport, visibleBounds);
  const visibleRects = clientRects.filter((rect) => isNonzeroRect(rect) && intersectsBounds(rect, bounds));
  if (visibleRects.length === 0) return { top: fallbackRect.top, bottom: fallbackRect.bottom };
  return {
    top: Math.min(...visibleRects.map((rect) => rect.top)),
    bottom: Math.max(...visibleRects.map((rect) => rect.bottom)),
  };
}

export function chooseVisibleRangeRect(
  clientRects: RectLike[],
  boundingRect: RectLike | null,
  viewport: { width: number; height: number },
  visibleBounds?: Pick<RectLike, "bottom" | "left" | "right" | "top">,
): RectLike | null {
  const bounds = getVisibleBounds(viewport, visibleBounds);
  const nonzero = clientRects.filter(isNonzeroRect);
  const visible = nonzero.find((rect) => intersectsBounds(rect, bounds));
  if (visible) return visible;
  return boundingRect && isNonzeroRect(boundingRect) && intersectsBounds(boundingRect, bounds)
    ? boundingRect
    : null;
}

function getVisibleBounds(
  viewport: { width: number; height: number },
  visibleBounds?: Pick<RectLike, "bottom" | "left" | "right" | "top">,
) {
  return {
    left: Math.max(0, visibleBounds?.left ?? 0),
    top: Math.max(0, visibleBounds?.top ?? 0),
    right: Math.min(viewport.width, visibleBounds?.right ?? viewport.width),
    bottom: Math.min(viewport.height, visibleBounds?.bottom ?? viewport.height),
  };
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
