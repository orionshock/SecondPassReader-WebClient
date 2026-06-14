import type { ReadingAnnotation } from "@secondpass/client";

type AnySelector =
  | { type?: unknown; value?: unknown; conformsTo?: unknown }
  | null
  | undefined
  | unknown;

export function getAnnotationMotivations(annotation: ReadingAnnotation): string[] {
  // Server contract: motivations are represented as an array.
  // Keep a small amount of defensive handling for unexpected shapes.
  const motivation = (annotation as unknown as { motivation?: unknown }).motivation;
  if (Array.isArray(motivation)) return motivation.filter((m) => typeof m === "string").map((m) => m.toLowerCase());
  if (typeof motivation === "string") return [motivation.toLowerCase()];
  return [];
}

export function hasAnnotationMotivation(annotation: ReadingAnnotation, motivation: string): boolean {
  const normalized = motivation.trim().toLowerCase();
  if (!normalized) return false;
  return getAnnotationMotivations(annotation).includes(normalized);
}

export function isBookmarkAnnotation(annotation: ReadingAnnotation): boolean {
  return hasAnnotationMotivation(annotation, "bookmarking");
}

export function isHighlightAnnotation(annotation: ReadingAnnotation): boolean {
  return hasAnnotationMotivation(annotation, "highlighting");
}

export function isCommentAnnotation(annotation: ReadingAnnotation): boolean {
  return hasAnnotationMotivation(annotation, "commenting");
}

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
