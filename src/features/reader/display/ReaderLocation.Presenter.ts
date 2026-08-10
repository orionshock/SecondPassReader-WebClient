import type { ReaderLocation, ReaderTocItem } from "../domain/ReaderDomain.Types";

function formatGeneratedOrdinal(index: number, total: number | undefined): string {
  const ordinal = Math.max(1, Math.floor(index) + 1);
  const totalWidth = typeof total === "number" && Number.isFinite(total) && total > 0
    ? String(Math.floor(total)).length
    : 0;
  return String(ordinal).padStart(Math.max(2, totalWidth), "0");
}

export function buildReaderLocationLabel(location: ReaderLocation | null | undefined): string {
  const progress = typeof location?.bookProgress === "number" && Number.isFinite(location.bookProgress)
    ? `${String(Math.round(location.bookProgress * 100)).padStart(2, "0")}%`
    : null;

  let ordinal: string | null = null;
  if (typeof location?.sectionIndex === "number" && Number.isFinite(location.sectionIndex) && location.sectionIndex >= 0) {
    ordinal = `Chapter ${formatGeneratedOrdinal(location.sectionIndex, location.sectionCount)}`;
  } else if (typeof location?.locationIndex === "number" && Number.isFinite(location.locationIndex) && location.locationIndex >= 0) {
    ordinal = `Location ${formatGeneratedOrdinal(location.locationIndex, location.locationCount)}`;
  }

  return [ordinal, progress].filter((part): part is string => Boolean(part)).join(" - ").slice(0, 255);
}

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
  const targetVariants = getHrefCompareVariants(target);
  const targetBases = new Set(Array.from(targetVariants).map((variant) => getHrefBasename(variant)).filter(Boolean));
  const visit = (items: ReaderTocItem[]): { label: string; score: 3 | 2 | 1 } | null => {
    let best: { label: string; score: 3 | 2 | 1 } | null = null;
    for (const item of items) {
      if (item.href) {
        const candidate = normalizeHrefForCompare(item.href);
        const candidateVariants = getHrefCompareVariants(candidate);
        const label = normalizeLabel(item.label);
        if (label) {
          if (setsIntersect(candidateVariants, targetVariants)) return { label, score: 3 };
          if (hasSuffixMatch(candidateVariants, targetVariants)) {
            if (!best || best.score < 2) best = { label, score: 2 };
          } else if (hasBasenameMatch(candidateVariants, targetBases)) {
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

function getHrefCompareVariants(href: string): Set<string> {
  const variants = new Set<string>();
  const normalized = normalizeHrefForCompare(href);
  if (!normalized) return variants;
  variants.add(normalized);

  const collapsedSplit = collapseEpubSplitHref(normalized);
  variants.add(collapsedSplit);

  for (const variant of Array.from(variants)) {
    const htmlVariant = swapHtmlExtension(variant);
    if (htmlVariant) variants.add(htmlVariant);
  }

  return variants;
}

function collapseEpubSplitHref(href: string): string {
  return href.replace(/_split_\d+(?=\.[^./]+$|$)/i, "");
}

function swapHtmlExtension(href: string): string | null {
  if (href.endsWith(".xhtml")) return `${href.slice(0, -6)}.html`;
  if (href.endsWith(".html")) return `${href.slice(0, -5)}.xhtml`;
  return null;
}

function setsIntersect(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) {
    if (b.has(value)) return true;
  }
  return false;
}

function hasSuffixMatch(a: Set<string>, b: Set<string>): boolean {
  for (const left of a) {
    for (const right of b) {
      if (left && right && (left.endsWith(right) || right.endsWith(left))) return true;
    }
  }
  return false;
}

function hasBasenameMatch(candidateVariants: Set<string>, targetBases: Set<string>): boolean {
  for (const candidate of candidateVariants) {
    const base = getHrefBasename(candidate);
    if (base && targetBases.has(base)) return true;
  }
  return false;
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
