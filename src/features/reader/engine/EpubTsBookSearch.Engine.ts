import type { Book } from "@likecoin/epub-ts";
import type { ReaderSearchOptions, ReaderSearchResult, ReaderTocItem } from "../domain/types";
import { buildQuoteContext } from "../selection/ReaderQuoteContext.Policy";
import { findTocLabelForHref } from "../display/ReaderLocation.Presenter";
import { repairImportedHighlightRangeInSection } from "./EpubTsImportRangeRepair.Engine";

type SectionRequest = (
  url: string,
  type?: string,
  withCredentials?: boolean,
  headers?: Record<string, string>,
  signal?: AbortSignal,
) => Promise<unknown>;

export async function searchEpubTsBook(
  book: Book,
  query: string,
  toc: ReaderTocItem[],
  options?: ReaderSearchOptions,
): Promise<ReaderSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const maxResults = clampInt(options?.maxResults, 1, 5000, 1000);
  const maxSeqEle = clampInt(options?.maxSeqEle, 1, 20, 6);
  const out: ReaderSearchResult[] = [];
  const seenCfiRanges = new Set<string>();
  const loadSectionResource = createSectionRequest(book);
  let linearIndex = 0;

  for (const section of book.spine.spineItems ?? []) {
    throwIfAborted(options?.signal);
    if (section.linear === false) continue;
    linearIndex += 1;

    const wasLoaded = Boolean(section.document);
    await section.load(loadSectionResource, options?.signal);
    throwIfAborted(options?.signal);

    try {
      const matches = section.search(trimmed, maxSeqEle);
      for (const match of matches) {
        if (!match?.cfi) continue;
        const repaired = options?.repairFullText
          ? repairImportedHighlightRangeInSection({
              section,
              anchorCfi: match.cfi,
              fragmentText: trimmed,
              fullText: options.repairFullText,
              signal: options.signal,
              onDiagnostic: options.onRangeRepairDiagnostic,
            })
          : null;
        const resultCfi = repaired?.cfiRange ?? match.cfi;
        const dedupeKey = normalizeCfiForDedupe(resultCfi);
        if (!dedupeKey || seenCfiRanges.has(dedupeKey)) continue;
        seenCfiRanges.add(dedupeKey);
        const resultText = repaired?.matchedText ?? trimmed;
        const quoteContext = buildSearchQuoteContext(section.document, resultText, match.excerpt);
        const sectionIndex = typeof section.index === "number" ? section.index : undefined;
        const sectionHref = section.href;
        out.push({
          id: `${sectionIndex ?? "section"}:${out.length}:${resultCfi}`,
          cfi: resultCfi,
          excerpt: improveSearchExcerpt(section.document, match.excerpt, trimmed),
          repairedText: repaired?.matchedText,
          quotePrefix: quoteContext.prefix,
          quoteSuffix: quoteContext.suffix,
          sectionIndex,
          linearIndex,
          sectionHref,
          sectionIdref: section.idref,
          sectionLabel: deriveSectionLabel({ toc, href: sectionHref, section, linearIndex, sectionIndex }),
        });
        if (out.length % 25 === 0) options?.onProgress?.([...out]);
        if (out.length >= maxResults) return out;
      }
      // TODO: future search can flatten section text and map offsets back to CFI
      // for more robust phrase matching across wider DOM boundaries.
    } finally {
      if (!wasLoaded) section.unload();
    }
    options?.onProgress?.([...out]);
    await yieldToBrowser();
  }

  return out;
}

function createSectionRequest(book: Book): SectionRequest {
  return async (url, type, _withCredentials, _headers, signal) => {
    throwIfAborted(signal);
    const result = await book.load(url, type);
    throwIfAborted(signal);
    return result;
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Search cancelled.", "AbortError");
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeSearchExcerpt(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCfiForDedupe(value: string): string {
  return value.trim();
}

function improveSearchExcerpt(doc: Document | undefined, excerpt: string, query: string): string {
  const normalizedExcerpt = normalizeSearchExcerpt(excerpt);
  if (!doc || normalizedExcerpt.length >= 180) return normalizedExcerpt;

  const bodyText = normalizeSearchExcerpt(doc.body?.textContent ?? doc.documentElement?.textContent ?? "");
  if (!bodyText) return normalizedExcerpt;

  const lowerBody = bodyText.toLowerCase();
  const lowerExcerpt = normalizedExcerpt.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const excerptAt = lowerExcerpt ? lowerBody.indexOf(lowerExcerpt) : -1;
  const queryInExcerptAt = lowerExcerpt.indexOf(lowerQuery);
  const queryAt =
    excerptAt >= 0 && queryInExcerptAt >= 0
      ? excerptAt + queryInExcerptAt
      : lowerBody.indexOf(lowerQuery);
  if (queryAt < 0) return normalizedExcerpt;

  const radius = 130;
  const start = Math.max(0, queryAt - radius);
  const end = Math.min(bodyText.length, queryAt + query.length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < bodyText.length ? "..." : "";
  return `${prefix}${bodyText.slice(start, end).trim()}${suffix}`;
}

function buildSearchQuoteContext(doc: Document | undefined, query: string, excerpt: string): { prefix?: string; suffix?: string } {
  const exact = normalizeSearchExcerpt(query);
  if (!doc || !exact) return {};
  const bodyText = normalizeSearchExcerpt(doc.body?.textContent ?? doc.documentElement?.textContent ?? "");
  if (!bodyText) return {};
  const lowerBody = bodyText.toLowerCase();
  const lowerExact = exact.toLowerCase();
  const normalizedExcerpt = normalizeSearchExcerpt(excerpt);
  const lowerExcerpt = normalizedExcerpt.toLowerCase();
  const excerptAt = lowerExcerpt ? lowerBody.indexOf(lowerExcerpt) : -1;
  const exactInExcerptAt = lowerExcerpt.indexOf(lowerExact);
  const at =
    excerptAt >= 0 && exactInExcerptAt >= 0
      ? excerptAt + exactInExcerptAt
      : lowerBody.indexOf(lowerExact);
  if (at < 0) return {};
  const before = bodyText.slice(0, at);
  const after = bodyText.slice(at + exact.length);
  const { prefix, suffix } = buildQuoteContext({ exact, before, after });
  return { prefix, suffix };
}

function sectionIndexLabel(index: number | undefined): string {
  return typeof index === "number" ? `Section ${index + 1}` : "Section";
}

function deriveSectionLabel(args: {
  toc: ReaderTocItem[];
  href: string | undefined;
  section: { document?: Document; idref?: string };
  linearIndex: number;
  sectionIndex: number | undefined;
}): string {
  const tocLabel = args.href ? findTocLabelForHref(args.toc, args.href) : null;
  if (tocLabel) return tocLabel;

  const documentLabel = getSectionDocumentLabel(args.section.document);
  if (documentLabel) return documentLabel;

  if (args.linearIndex > 0) return `Chapter ${args.linearIndex}`;
  return sectionIndexLabel(args.sectionIndex);
}

function getSectionDocumentLabel(doc: Document | undefined): string | null {
  if (!doc) return null;
  const title = doc.querySelector("title")?.textContent;
  const titleText = normalizeLabel(title);
  if (titleText) return titleText;
  const heading = doc.querySelector("h1, h2, h3, [role='heading']")?.textContent;
  return normalizeLabel(heading);
}

function normalizeLabel(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || null;
}
