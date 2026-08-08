import type { ReaderSelectionAnchor } from "../domain/types";

type RectLike = Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">;

export function getVisibleCfiRangeAnchor(range: Range): ReaderSelectionAnchor | null {
  try {
    const doc = range.startContainer.ownerDocument;
    const view = doc?.defaultView;
    const frame = view?.frameElement;
    if (!view || !frame || typeof frame.getBoundingClientRect !== "function") return null;

    const rect = chooseVisibleRangeRect(
      Array.from(range.getClientRects()),
      range.getBoundingClientRect(),
      { width: view.innerWidth, height: view.innerHeight },
    );
    if (!rect) return null;
    const frameRect = frame.getBoundingClientRect();
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
): RectLike | null {
  const nonzero = clientRects.filter(isNonzeroRect);
  const visible = nonzero.find((rect) => (
    rect.right > 0
    && rect.bottom > 0
    && rect.left < viewport.width
    && rect.top < viewport.height
  ));
  if (visible) return visible;
  return boundingRect && isNonzeroRect(boundingRect) ? boundingRect : null;
}

function isNonzeroRect(rect: RectLike): boolean {
  return rect.width > 0 && rect.height > 0;
}
