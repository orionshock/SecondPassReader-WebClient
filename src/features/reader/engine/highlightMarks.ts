import type { Rendition } from "@likecoin/epub-ts";
import type { ReaderHighlightMark } from "../domain/types";

export type HighlightMarkPainter = {
  setHighlightMarks(marks: ReaderHighlightMark[]): void;
  setTemporarySearchHighlight(cfiRange: string | null): void;
  clear(): void;
};

export function createHighlightMarkPainter(args: { rendition: Rendition; onError?: (error: unknown) => void }): HighlightMarkPainter {
  const { rendition, onError } = args;

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
    // epub-ts will default to yellow; support simple named tokens / hex / css colors by passing them through.
    // Avoid trying to parse arbitrary strings here.
    //
    // Note: epub-ts highlight implementations vary by view; some apply styles to SVG overlays (fill),
    // others apply styles to DOM elements (background-color). Provide both so color changes reliably
    // reflect in the viewport without depending on a specific internal representation.
    return {
      fill: c,
      "fill-opacity": "0.22",
      "mix-blend-mode": "multiply",
      "background-color": c,
      background: c,
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
          undefined,
          "sp-annotation-hl",
          toHighlightAttributes(existing.color),
        );
      } catch (err) {
        onError?.(err);
      }
    }
  };

  return {
    setHighlightMarks(marks: ReaderHighlightMark[]) {
      const nextIds = new Set<string>();
      const validMarks: ReaderHighlightMark[] = [];
      for (const m of marks) {
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

        // If this id moved, remove the old one first (epub-ts keys by cfiRange+type).
        try {
          if (existing?.cfiRange) {
            removeRendererHighlight(existing.cfiRange);
          } else if (mustRepaintAfterSharedCfiRemoval) {
            removeRendererHighlight(cfiRange);
          }
        } catch {
          // ignore
        }

        try {
          rendition.annotations.highlight(
            cfiRange,
            { id },
            undefined,
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
