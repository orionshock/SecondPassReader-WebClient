import type { Book } from "@likecoin/epub-ts";
import type { ReaderSearchOptions, ReaderSearchResult, ReaderTocItem } from "../domain/types";

export async function searchEpubTsBook(
  book: Book,
  query: string,
  toc: ReaderTocItem[],
  options?: ReaderSearchOptions,
): Promise<ReaderSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const maxResults = clampInt(options?.maxResults, 1, 250, 100);
  const maxSeqEle = clampInt(options?.maxSeqEle, 1, 20, 6);
  const out: ReaderSearchResult[] = [];

  for (const section of book.spine.spineItems ?? []) {
    throwIfAborted(options?.signal);
    if (section.linear === false) continue;

    const wasLoaded = Boolean(section.document);
    await section.load(book.request, options?.signal);
    throwIfAborted(options?.signal);

    try {
      const matches = section.search(trimmed, maxSeqEle);
      for (const match of matches) {
        if (!match?.cfi) continue;
        const sectionIndex = typeof section.index === "number" ? section.index : undefined;
        const sectionHref = section.href;
        out.push({
          id: `${sectionIndex ?? "section"}:${out.length}:${match.cfi}`,
          cfi: match.cfi,
          excerpt: normalizeSearchExcerpt(match.excerpt),
          sectionIndex,
          sectionHref,
          sectionLabel: findTocLabelForHref(toc, sectionHref) ?? sectionIndexLabel(sectionIndex),
        });
        if (out.length >= maxResults) return out;
      }
      // TODO: future search can flatten section text and map offsets back to CFI
      // for more robust phrase matching across wider DOM boundaries.
    } finally {
      if (!wasLoaded) section.unload();
    }
  }

  return out;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Search cancelled.", "AbortError");
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeSearchExcerpt(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sectionIndexLabel(index: number | undefined): string | undefined {
  return typeof index === "number" ? `Section ${index + 1}` : undefined;
}

function normalizeHrefForCompare(href: string): string {
  const s = href.trim();
  const hashIdx = s.indexOf("#");
  return (hashIdx >= 0 ? s.slice(0, hashIdx) : s).toLowerCase();
}

function findTocLabelForHref(toc: ReaderTocItem[], href: string | undefined): string | undefined {
  if (!href) return undefined;
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
      if (item.children?.length) {
        const found = visit(item.children);
        if (found?.score === 2) return found;
        if (!best && found) best = found;
      }
    }
    return best;
  };

  return visit(toc)?.label;
}
