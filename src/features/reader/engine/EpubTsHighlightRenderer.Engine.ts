import type { Rendition } from "@likecoin/epub-ts";
import { resolveAnnotationColor } from "../display/ReaderAnnotation.Presenter";
import type { ReaderHighlightMark } from "../domain/ReaderDomain.Types";

export type EpubTsHighlightRenderer = {
  setHighlightMarks(marks: ReaderHighlightMark[]): void;
  setTemporarySearchHighlight(cfiRange: string | null): void;
  refresh(): void;
  clear(): void;
};

export type HighlightMarkClick = {
  annotationId: string;
  cfiRange: string;
  clientX?: number;
  clientY?: number;
  bounds?: HighlightMarkBounds;
};

export type HighlightMarkBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

const STAGED_SELECTION_MARK_ID = "__staged_selection__";

/**
 * epub-ts identifies highlights by CFI and renderer type, not by application id.
 * A staged preview at an existing durable CFI must therefore replace that CFI's
 * renderer mark temporarily. The durable marks remain in application state and
 * are restored when the staged preview is cleared.
 */
export function reconcileHighlightMarksForRenderer(marks: ReaderHighlightMark[]): ReaderHighlightMark[] {
  const stagedCfiRanges = new Set<string>();
  for (const mark of marks) {
    const cfiRange = typeof mark?.cfiRange === "string" ? mark.cfiRange.trim() : "";
    if (mark?.id === STAGED_SELECTION_MARK_ID && cfiRange) stagedCfiRanges.add(cfiRange);
  }

  return marks.filter((mark) => {
    const cfiRange = typeof mark?.cfiRange === "string" ? mark.cfiRange.trim() : "";
    return mark?.id === STAGED_SELECTION_MARK_ID || !stagedCfiRanges.has(cfiRange);
  });
}

export function createEpubTsHighlightRenderer(args: {
  rendition: Rendition;
  onError?: (error: unknown) => void;
  onHighlightClick?: (click: HighlightMarkClick) => void;
}): EpubTsHighlightRenderer {
  const { rendition, onError, onHighlightClick } = args;

  // epub-ts renderer annotations are keyed internally by CFI range + renderer
  // annotation type (for this painter, "highlight"), not by our app annotation
  // id. Do not intentionally keep search, staged, and durable highlights alive
  // at the same CFI; adding one can replace the renderer store entry for another
  // without detaching the older visual mark from the current view.
  const paintedHighlightsById = new Map<string, { cfiRange: string; color?: string; colorKey: string }>();
  let temporarySearchCfiRange: string | null = null;

  const toHighlightAttributes = (color: string | undefined): Record<string, string> | undefined => {
    const c = typeof color === "string" ? color.trim() : "";
    if (!c) return undefined;
    const paintColor = resolveAnnotationColor(c) ?? c;
    // epub-ts will default to yellow; support simple named tokens / hex / css colors by passing them through.
    // Avoid trying to parse arbitrary strings here.
    //
    // Note: epub-ts highlight implementations vary by view; some apply styles to SVG overlays (fill),
    // others apply styles to DOM elements (background-color). Provide both so color changes reliably
    // reflect in the viewport without depending on a specific internal representation.
    return {
      fill: paintColor,
      "fill-opacity": "0.42",
      "mix-blend-mode": "multiply",
      "background-color": paintColor,
      background: paintColor,
    };
  };

  const colorKeyOf = (color: string | undefined): string => (typeof color === "string" ? color.trim().toLowerCase() : "");

  const removeRendererHighlight = (cfiRange: string) => {
    try {
      rendition.annotations.remove(cfiRange, "highlight");
    } catch {
      // ignore
    }
  };

  const hasPaintedMarkAtCfi = (cfiRange: string) => {
    for (const existing of paintedHighlightsById.values()) {
      if (existing.cfiRange === cfiRange) return true;
    }
    return false;
  };

  const repaintPaintedMarksAtCfi = (cfiRange: string) => {
    for (const [id, existing] of paintedHighlightsById) {
      if (existing.cfiRange !== cfiRange) continue;
      try {
        rendition.annotations.highlight(
          existing.cfiRange,
          { id },
          createDurableHighlightClickHandler(id, existing.cfiRange),
          "sp-annotation-hl",
          toHighlightAttributes(existing.color),
        );
      } catch (err) {
        onError?.(err);
      }
    }
  };

  const paintTemporarySearchHighlight = () => {
    if (!temporarySearchCfiRange) return;
    try {
      rendition.annotations.highlight(
        temporarySearchCfiRange,
        { id: "sp-search-result-highlight" },
        undefined,
        "sp-search-result-hl",
        {
          fill: "#facc15",
          "fill-opacity": "0.34",
          "mix-blend-mode": "multiply",
          "background-color": "rgba(250, 204, 21, 0.34)",
          background: "rgba(250, 204, 21, 0.34)",
          stroke: "#ca8a04",
          "stroke-opacity": "0.7",
        },
      );
    } catch (err) {
      onError?.(err);
    }
  };

  const createDurableHighlightClickHandler = (id: string, cfiRange: string) => {
    if (!onHighlightClick || isReservedHighlightId(id)) return undefined;
    return (event?: Event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const point = getEventClientPoint(event);
      const bounds = getEventBounds(event);
      onHighlightClick({
        annotationId: id,
        cfiRange,
        clientX: point?.clientX,
        clientY: point?.clientY,
        bounds: bounds ?? undefined,
      });
    };
  };

  return {
    setHighlightMarks(marks: ReaderHighlightMark[]) {
      const nextIds = new Set<string>();
      const validMarks: ReaderHighlightMark[] = [];
      for (const m of reconcileHighlightMarksForRenderer(marks)) {
        if (!m || typeof m.id !== "string") continue;
        const id = m.id;
        const cfiRange = typeof m.cfiRange === "string" ? m.cfiRange.trim() : "";
        if (!id || !cfiRange) continue;
        nextIds.add(id);
        validMarks.push(m);
      }

      const removedCfiRanges = new Set<string>();
      const nextCfiRanges = new Set(validMarks.map((m) => m.cfiRange.trim()));

      if (temporarySearchCfiRange && nextCfiRanges.has(temporarySearchCfiRange)) {
        removeRendererHighlight(temporarySearchCfiRange);
        temporarySearchCfiRange = null;
      }

      // Remove stale annotations before adding next annotations. epub-ts removes by
      // cfiRange+type, so removing a stale staged mark after adding a durable mark
      // at the same CFI can accidentally remove the durable annotation too.
      for (const [id, existing] of paintedHighlightsById) {
        if (nextIds.has(id)) continue;
        removedCfiRanges.add(existing.cfiRange);
        removeRendererHighlight(existing.cfiRange);
        paintedHighlightsById.delete(id);
      }

      for (const m of validMarks) {
        const id = m.id;
        const cfiRange = m.cfiRange.trim();
        const existing = paintedHighlightsById.get(id);
        const nextColorKey = colorKeyOf(m.color);
        const mustRepaintAfterSharedCfiRemoval = removedCfiRanges.has(cfiRange);
        if (existing && existing.cfiRange === cfiRange && existing.colorKey === nextColorKey && !mustRepaintAfterSharedCfiRemoval) continue;

        // If this id moved or changed, remove its old renderer mark first. A
        // shared-CFI stale mark was already removed by the stale-id pass above.
        if (existing?.cfiRange) removeRendererHighlight(existing.cfiRange);

        try {
          rendition.annotations.highlight(
            cfiRange,
            { id },
            createDurableHighlightClickHandler(id, cfiRange),
            "sp-annotation-hl",
            toHighlightAttributes(m.color),
          );
          paintedHighlightsById.set(id, { cfiRange, color: m.color, colorKey: nextColorKey });
        } catch (err) {
          onError?.(err);
        }
      }
    },
    setTemporarySearchHighlight(cfiRange: string | null) {
      const next = typeof cfiRange === "string" && cfiRange.trim() ? cfiRange.trim() : null;
      if (temporarySearchCfiRange === next) return;
      if (temporarySearchCfiRange) {
        removeRendererHighlight(temporarySearchCfiRange);
        repaintPaintedMarksAtCfi(temporarySearchCfiRange);
      }
      temporarySearchCfiRange = next;
      if (!temporarySearchCfiRange) return;
      if (hasPaintedMarkAtCfi(temporarySearchCfiRange)) {
        temporarySearchCfiRange = null;
        return;
      }
      paintTemporarySearchHighlight();
    },
    refresh() {
      const durableCfiRanges = new Set(
        [...paintedHighlightsById.values()].map((mark) => mark.cfiRange),
      );
      for (const cfiRange of durableCfiRanges) {
        removeRendererHighlight(cfiRange);
        repaintPaintedMarksAtCfi(cfiRange);
      }
      if (temporarySearchCfiRange) removeRendererHighlight(temporarySearchCfiRange);
      paintTemporarySearchHighlight();
    },
    clear() {
      if (temporarySearchCfiRange) {
        removeRendererHighlight(temporarySearchCfiRange);
      }
      temporarySearchCfiRange = null;
      paintedHighlightsById.clear();
    },
  };
}

function isReservedHighlightId(id: string): boolean {
  return id === STAGED_SELECTION_MARK_ID || id === "sp-search-result-highlight";
}

function getEventClientPoint(event: Event | undefined): { clientX: number; clientY: number } | null {
  const mouse = event as MouseEvent | undefined;
  if (typeof mouse?.clientX === "number" && typeof mouse.clientY === "number" && (mouse.clientX || mouse.clientY)) {
    return { clientX: mouse.clientX, clientY: mouse.clientY };
  }
  const touch = event as TouchEvent | undefined;
  const firstTouch = touch?.changedTouches?.[0] ?? touch?.touches?.[0];
  if (firstTouch) return { clientX: firstTouch.clientX, clientY: firstTouch.clientY };
  const el = getEventElement(event);
  const rect = el?.getBoundingClientRect() ?? null;
  const frameOffset = getFrameOffset(el);
  if (rect) return { clientX: rect.left + rect.width / 2 + frameOffset.left, clientY: rect.top + rect.height / 2 + frameOffset.top };
  return null;
}

function getEventBounds(event: Event | undefined): HighlightMarkBounds | null {
  const el = getEventElement(event);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const frameOffset = getFrameOffset(el);
  return {
    left: rect.left + frameOffset.left,
    right: rect.right + frameOffset.left,
    top: rect.top + frameOffset.top,
    bottom: rect.bottom + frameOffset.top,
    width: rect.width,
    height: rect.height,
  };
}

function getEventElement(event: Event | undefined): Element | null {
  const target = event?.currentTarget;
  return isElementLike(target) ? target : null;
}

function getFrameOffset(el: Element | null): { left: number; top: number } {
  const frame = el?.ownerDocument?.defaultView?.frameElement;
  if (!isElementLike(frame)) return { left: 0, top: 0 };
  const rect = frame.getBoundingClientRect();
  return { left: rect.left, top: rect.top };
}

function isElementLike(value: unknown): value is Element {
  return Boolean(value && typeof (value as Element).getBoundingClientRect === "function");
}
