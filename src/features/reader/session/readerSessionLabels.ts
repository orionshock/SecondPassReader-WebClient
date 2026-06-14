import type { ReaderLocation, ReaderTocItem } from "../domain/types";

export function buildReaderStatusLine(input: {
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
  bookTitle?: string | null;
}): string[] {
  const parts: string[] = [];
  const chapterLabel = getReaderLocationTocLabel({
    toc: input.toc,
    href: input.location?.href,
    bookTitle: input.bookTitle,
  });
  if (chapterLabel) parts.push(chapterLabel);

  if (typeof input.location?.displayedPage === "number" && typeof input.location?.displayedTotal === "number") {
    parts.push(`p${input.location.displayedPage}/${input.location.displayedTotal}`);
  }

  if (typeof input.location?.bookProgress === "number" && Number.isFinite(input.location.bookProgress)) {
    parts.push(`${Math.round(input.location.bookProgress * 100)}%`);
  }

  return parts;
}

export function normalizeHrefForCompare(href: string): string {
  const s = href.trim().replace(/\\/g, "/");
  const hashIdx = s.indexOf("#");
  const withoutHash = hashIdx >= 0 ? s.slice(0, hashIdx) : s;
  const queryIdx = withoutHash.indexOf("?");
  const withoutQuery = queryIdx >= 0 ? withoutHash.slice(0, queryIdx) : withoutHash;
  const withoutLeadingSlash = withoutQuery.replace(/^\/+/, "");
  try {
    return decodeURIComponent(withoutLeadingSlash).toLowerCase();
  } catch {
    return withoutLeadingSlash.toLowerCase();
  }
}

export function findTocLabelForHref(toc: ReaderTocItem[], href: string): string | null {
  const target = normalizeHrefForCompare(href);
  if (!target) return null;
  const targetBase = getHrefBasename(target);
  const visit = (items: ReaderTocItem[]): { label: string; score: 3 | 2 | 1 } | null => {
    let best: { label: string; score: 3 | 2 | 1 } | null = null;
    for (const item of items) {
      if (item.href) {
        const candidate = normalizeHrefForCompare(item.href);
        const label = normalizeLabel(item.label);
        if (label) {
          if (candidate === target) return { label, score: 3 };
          if (candidate && target && (candidate.endsWith(target) || target.endsWith(candidate))) {
            if (!best || best.score < 2) best = { label, score: 2 };
          } else if (targetBase && getHrefBasename(candidate) === targetBase) {
            if (!best) best = { label, score: 1 };
          }
        }
      }
      if (item.children && item.children.length > 0) {
        const found = visit(item.children);
        if (found?.score === 3) return found;
        if (found && (!best || found.score > best.score)) best = found;
      }
    }
    return best;
  };

  return visit(toc)?.label ?? null;
}

export function getReaderLocationTocLabel(input: {
  toc: ReaderTocItem[] | null | undefined;
  href: string | null | undefined;
  bookTitle?: string | null;
}): string | null {
  const href = typeof input.href === "string" ? input.href.trim() : "";
  if (!href || !input.toc) return null;
  const tocLabel = findTocLabelForHref(input.toc, href);
  if (!tocLabel) return null;
  const stripped = stripBookTitleSuffix(tocLabel, input.bookTitle);
  if (!stripped) return null;
  if (input.bookTitle && normalizeLabelForCompare(stripped) === normalizeLabelForCompare(input.bookTitle)) return null;
  return stripped;
}

function getHrefBasename(href: string): string {
  const parts = href.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function stripBookTitleSuffix(label: string, bookTitle: string | null | undefined): string {
  const title = typeof bookTitle === "string" ? bookTitle.trim() : "";
  if (!title) return label;
  const normalizedTitle = normalizeLabelForCompare(title);
  const separators = [",", " - ", ":", "|"];

  for (const separator of separators) {
    const idx = label.lastIndexOf(separator);
    if (idx <= 0) continue;
    const suffix = label.slice(idx + separator.length).trim();
    if (normalizeLabelForCompare(suffix) === normalizedTitle) return label.slice(0, idx).trim();
  }

  return label;
}

function normalizeLabel(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || null;
}

function normalizeLabelForCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
