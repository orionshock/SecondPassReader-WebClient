import type { ReaderLocation, ReaderTocItem } from "../domain/types";

export function buildReaderStatusLine(input: {
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
}): string[] {
  const parts: string[] = [];
  const chapterLabel = input.toc && input.location?.href ? findTocLabelForHref(input.toc, input.location.href) : null;
  if (chapterLabel) parts.push(chapterLabel);

  if (typeof input.location?.bookProgress === "number" && Number.isFinite(input.location.bookProgress)) {
    parts.push(`${Math.round(input.location.bookProgress * 100)}%`);
  }

  if (typeof input.location?.displayedPage === "number" && typeof input.location?.displayedTotal === "number") {
    parts.push(`p${input.location.displayedPage}/${input.location.displayedTotal}`);
  }

  return parts;
}

export function normalizeHrefForCompare(href: string): string {
  const s = href.trim();
  const hashIdx = s.indexOf("#");
  return (hashIdx >= 0 ? s.slice(0, hashIdx) : s).toLowerCase();
}

export function findTocLabelForHref(toc: ReaderTocItem[], href: string): string | null {
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
