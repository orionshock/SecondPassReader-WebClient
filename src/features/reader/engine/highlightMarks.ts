import type { Rendition } from "@likecoin/epub-ts";
import type { ReaderHighlightMark } from "../domain/types";

export type HighlightMarkPainter = {
  setHighlightMarks(marks: ReaderHighlightMark[]): void;
  clear(): void;
};

export function createHighlightMarkPainter(args: { rendition: Rendition; onError?: (error: unknown) => void }): HighlightMarkPainter {
  const { rendition, onError } = args;

  const paintedHighlightsById = new Map<string, { cfiRange: string; colorKey: string }>();

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

  return {
    setHighlightMarks(marks: ReaderHighlightMark[]) {
      const nextIds = new Set<string>();
      for (const m of marks) {
        if (!m || typeof m.id !== "string") continue;
        const id = m.id;
        const cfiRange = typeof m.cfiRange === "string" ? m.cfiRange.trim() : "";
        if (!id || !cfiRange) continue;
        nextIds.add(id);

        const existing = paintedHighlightsById.get(id);
        const nextColorKey = colorKeyOf(m.color);
        if (existing && existing.cfiRange === cfiRange && existing.colorKey === nextColorKey) continue;

        // If this id moved, remove the old one first (epub-ts keys by cfiRange+type).
        try {
          if (existing?.cfiRange) rendition.annotations.remove(existing.cfiRange, "highlight");
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
          paintedHighlightsById.set(id, { cfiRange, colorKey: nextColorKey });
        } catch (err) {
          onError?.(err);
        }
      }

      // Remove any painted highlights that are no longer present.
      for (const [id, existing] of paintedHighlightsById) {
        if (nextIds.has(id)) continue;
        try {
          rendition.annotations.remove(existing.cfiRange, "highlight");
        } catch {
          // ignore
        }
        paintedHighlightsById.delete(id);
      }
    },
    clear() {
      paintedHighlightsById.clear();
    },
  };
}

