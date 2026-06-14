import type { ReadingAnnotation } from "@secondpass/client";
import type { ReaderAnnotation } from "../domain/types";
import type { ReaderLocationDescription, ReaderTocItem } from "../domain/types";
import { toReaderCfiLocationDisplay } from "../session/readerCfiDescriptions";

export type ReaderBookmark = Extract<ReaderAnnotation, { kind: "bookmark" }>;
export type ReaderBookmarkViewModel = {
  id: string;
  cfi: string;
  href?: string;
  label: string;
  labelParts: string[];
  timestamp?: string;
  isCurrent: boolean;
  descriptionStatus: "idle" | "loading" | "ready" | "error";
};

function normalizeMotivation(motivation: unknown): string[] {
  // Server contract: motivations are represented as an array.
  // Keep defensive handling for unexpected shapes.
  if (Array.isArray(motivation)) return motivation.filter((m) => typeof m === "string").map((m) => m.toLowerCase());
  if (typeof motivation === "string") return [motivation.toLowerCase()];
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

export function toBookmarkViewModel(input: {
  bookmark: ReaderBookmark;
  currentCfi?: string | null;
  toc?: ReaderTocItem[] | null;
  bookTitle?: string | null;
  description?: ReaderLocationDescription | null;
  fallbackBookProgress?: number | null | undefined;
  timestamp?: string | null;
  descriptionStatus: "idle" | "loading" | "ready" | "error";
}): ReaderBookmarkViewModel {
  const isCurrent = Boolean(input.currentCfi && input.bookmark.cfi === input.currentCfi);
  const description = input.description
    ? {
        ...input.description,
        bookProgress: input.description.bookProgress ?? (isCurrent ? input.fallbackBookProgress : null),
      }
    : isCurrent && typeof input.fallbackBookProgress === "number"
      ? { cfi: input.bookmark.cfi, bookProgress: input.fallbackBookProgress }
      : null;
  const locationDisplay = toReaderCfiLocationDisplay({
    description,
    toc: input.toc,
    bookTitle: input.bookTitle,
  });
  return {
    id: input.bookmark.id,
    cfi: input.bookmark.cfi,
    href: description?.href,
    label: locationDisplay.label,
    labelParts: locationDisplay.labelParts,
    timestamp: input.timestamp ?? undefined,
    isCurrent,
    descriptionStatus: input.descriptionStatus,
  };
}
