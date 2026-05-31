import type { ReadingAnnotation } from "@secondpass/client";
import type { ReaderAnnotation } from "../domain/types";

function normalizeMotivation(motivation: unknown): string[] {
  if (typeof motivation === "string") return [motivation.toLowerCase()];
  if (Array.isArray(motivation)) return motivation.filter((m) => typeof m === "string").map((m) => m.toLowerCase());
  return [];
}

export function isBookmarkAnnotation(annotation: ReadingAnnotation): boolean {
  const motivations = normalizeMotivation((annotation as unknown as { motivation?: unknown }).motivation);
  return motivations.includes("bookmarking");
}

export function isHighlightAnnotation(annotation: ReadingAnnotation): boolean {
  const motivations = normalizeMotivation((annotation as unknown as { motivation?: unknown }).motivation);
  return motivations.includes("highlighting");
}

type AnySelector =
  | { type?: unknown; value?: unknown; conformsTo?: unknown }
  | null
  | undefined
  | unknown;

function getFragmentSelectorValue(selector: AnySelector): string | null {
  if (!selector || typeof selector !== "object") return null;
  const anySel = selector as { type?: unknown; value?: unknown };
  if (typeof anySel.type !== "string") return null;
  if (anySel.type !== "FragmentSelector") return null;
  if (typeof anySel.value !== "string") return null;
  const cfi = anySel.value.trim();
  return cfi ? cfi : null;
}

export function getAnnotationFragmentCfi(annotation: ReadingAnnotation): string | null {
  const target = (annotation as unknown as { target?: unknown }).target as { selector?: unknown } | undefined;
  const selector = (target as any)?.selector;
  if (!selector) return null;
  if (Array.isArray(selector)) {
    for (const sel of selector) {
      const cfi = getFragmentSelectorValue(sel);
      if (cfi) return cfi;
    }
    return null;
  }
  return getFragmentSelectorValue(selector);
}

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

