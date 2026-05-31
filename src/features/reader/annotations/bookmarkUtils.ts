import type { ReadingAnnotation } from "@secondpass/client";
import type { ReaderAnnotation } from "../domain/types";
import type { ReaderLocationDescription, ReaderTocItem } from "../domain/types";
import { deriveBookmarkLabel } from "./bookmarkLabels";

export type ReaderBookmark = Extract<ReaderAnnotation, { kind: "bookmark" }>;
export type ReaderBookmarkViewModel = {
  id: string;
  cfi: string;
  href?: string;
  label: string;
  isCurrent: boolean;
  descriptionStatus: "idle" | "loading" | "ready" | "error";
};

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

function normalizeHrefForCompare(href: string): string {
  const s = href.trim();
  const hashIdx = s.indexOf("#");
  return (hashIdx >= 0 ? s.slice(0, hashIdx) : s).toLowerCase();
}

function findTocLabelForHref(toc: ReaderTocItem[], href: string): string | null {
  const target = normalizeHrefForCompare(href);
  const visit = (items: ReaderTocItem[]): { label: string; score: 2 | 1 } | null => {
    let best: { label: string; score: 2 | 1 } | null = null;
    for (const item of items) {
      if (item.href) {
        const candidate = normalizeHrefForCompare(item.href);
        if (candidate === target) return { label: item.label, score: 2 };
        if (candidate && target && (candidate.endsWith(target) || target.endsWith(candidate))) {
          if (!best) best = { label: item.label, score: 1 };
        }
      }
      if (item.children && item.children.length > 0) {
        const found = visit(item.children);
        if (found?.score === 2) return found;
        if (!best && found) best = found;
      }
    }
    return best;
  };

  return visit(toc)?.label ?? null;
}

export function toBookmarkViewModel(input: {
  bookmark: ReaderBookmark;
  currentCfi?: string | null;
  toc?: ReaderTocItem[] | null;
  description?: ReaderLocationDescription | null;
  fallbackBookProgress?: number | null | undefined;
  descriptionStatus: "idle" | "loading" | "ready" | "error";
}): ReaderBookmarkViewModel {
  const isCurrent = Boolean(input.currentCfi && input.bookmark.cfi === input.currentCfi);
  const href = input.description?.href;
  const chapterLabel = href && input.toc ? findTocLabelForHref(input.toc, href) : null;
  const label = deriveBookmarkLabel({
    chapterLabel,
    bookProgress: input.description?.bookProgress ?? (isCurrent ? input.fallbackBookProgress : null),
  });
  return {
    id: input.bookmark.id,
    cfi: input.bookmark.cfi,
    href,
    label,
    isCurrent,
    descriptionStatus: input.descriptionStatus,
  };
}
