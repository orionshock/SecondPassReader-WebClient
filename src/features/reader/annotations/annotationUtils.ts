import type { ReadingAnnotation } from "@secondpass/client";
import type { ReaderAnnotation } from "../domain/types";
import { getAnnotationFragmentCfi, isBookmarkAnnotation, isHighlightAnnotation } from "./annotationSelectors";

export { getAnnotationFragmentCfi, isBookmarkAnnotation, isHighlightAnnotation } from "./annotationSelectors";

export function getAnnotationDescribingText(annotation: ReadingAnnotation): string | null {
  const body = (annotation as unknown as { body?: unknown }).body;
  if (!Array.isArray(body)) return null;
  for (const b of body) {
    if (!b || typeof b !== "object") continue;
    const anyB = b as { type?: unknown; value?: unknown; purpose?: unknown };
    if (anyB.type !== "TextualBody") continue;
    if (typeof anyB.value !== "string") continue;
    if (anyB.purpose && anyB.purpose !== "describing") continue;
    const s = anyB.value.trim();
    if (s) return s;
  }
  return null;
}

export function getAnnotationNoteText(annotation: ReadingAnnotation): string | null {
  const body = (annotation as unknown as { body?: unknown }).body;
  if (!Array.isArray(body)) return null;
  for (const b of body) {
    if (!b || typeof b !== "object") continue;
    const anyB = b as { type?: unknown; value?: unknown; purpose?: unknown };
    if (anyB.type !== "TextualBody") continue;
    if (typeof anyB.value !== "string") continue;
    // Prefer explicit commenting purpose; fall back to any non-describing TextualBody.
    if (anyB.purpose && anyB.purpose !== "commenting") continue;
    const s = anyB.value.trim();
    if (s) return s;
  }
  // Fallback: find first non-empty TextualBody that isn't the describing text.
  const describing = getAnnotationDescribingText(annotation);
  for (const b of body) {
    if (!b || typeof b !== "object") continue;
    const anyB = b as { type?: unknown; value?: unknown; purpose?: unknown };
    if (anyB.type !== "TextualBody") continue;
    if (typeof anyB.value !== "string") continue;
    const s = anyB.value.trim();
    if (!s) continue;
    if (describing && s === describing) continue;
    return s;
  }
  return null;
}

export function getAnnotationColor(annotation: ReadingAnnotation): string | null {
  const body = (annotation as unknown as { body?: unknown }).body;
  if (!Array.isArray(body)) return null;
  for (const b of body) {
    if (!b || typeof b !== "object") continue;
    const anyB = b as { type?: unknown; color?: unknown; purpose?: unknown };
    if (anyB.type !== "TextualBody") continue;
    if (typeof anyB.color !== "string") continue;
    const c = anyB.color.trim();
    if (c) return c;
  }
  return null;
}

export function getAnnotationTimestamp(annotation: ReadingAnnotation): string | null {
  const anyA = annotation as unknown as { updated_at?: unknown; modified?: unknown; created_at?: unknown; created?: unknown };
  const candidates = [anyA.updated_at, anyA.modified, anyA.created_at, anyA.created];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const s = c.trim();
    if (s) return s;
  }
  return null;
}

export function toReaderAnnotation(annotation: ReadingAnnotation): ReaderAnnotation | null {
  if (isBookmarkAnnotation(annotation)) {
    const cfi = getAnnotationFragmentCfi(annotation);
    if (!cfi) return null;
    return { kind: "bookmark", id: annotation.id, cfi };
  }
  if (isHighlightAnnotation(annotation)) {
    const cfiRange = getAnnotationFragmentCfi(annotation);
    if (!cfiRange) return null;
    const text = getAnnotationDescribingText(annotation) ?? undefined;
    return { kind: "highlight", id: annotation.id, cfiRange, text };
  }
  return null;
}
