import type { ReadingAnnotation } from "@secondpass/client";
import type { ReaderAnnotation } from "../domain/types";

export type ReaderBookmark = Extract<ReaderAnnotation, { kind: "bookmark" }>;

function normalizeMotivation(motivation: unknown): string[] {
  if (typeof motivation === "string") return [motivation.toLowerCase()];
  if (Array.isArray(motivation)) return motivation.filter((m) => typeof m === "string").map((m) => m.toLowerCase());
  return [];
}

export function isBookmarkAnnotation(annotation: ReadingAnnotation): boolean {
  const motivations = normalizeMotivation((annotation as unknown as { motivation?: unknown }).motivation);
  return motivations.includes("bookmarking");
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

export function getAnnotationCfi(annotation: ReadingAnnotation): string | null {
  const target = (annotation as unknown as { target?: unknown }).target as { selector?: unknown } | undefined;
  const selector = target?.selector;
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

export function toReaderBookmark(annotation: ReadingAnnotation): ReaderBookmark | null {
  if (!isBookmarkAnnotation(annotation)) return null;
  const cfi = getAnnotationCfi(annotation);
  if (!cfi) return null;
  return { kind: "bookmark", id: annotation.id, cfi };
}

