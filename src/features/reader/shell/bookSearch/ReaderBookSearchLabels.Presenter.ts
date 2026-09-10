import type { ReaderSearchResult } from "../../domain/ReaderDomain.Types";

export function getSearchResultDisplayLabel(result: ReaderSearchResult, bookTitle: string | null | undefined): string {
  const fallback = getSearchResultFallbackLabel(result);
  const raw = typeof result.sectionLabel === "string" ? result.sectionLabel.trim() : "";
  if (!raw) return fallback;

  const stripped = stripBookTitleSuffix(raw, bookTitle);
  if (!stripped) return fallback;
  if (bookTitle && normalizeLabelForCompare(stripped) === normalizeLabelForCompare(bookTitle)) return fallback;
  return stripped;
}

function getSearchResultFallbackLabel(result: ReaderSearchResult): string {
  if (typeof result.linearIndex === "number" && result.linearIndex > 0) return `Chapter ${result.linearIndex}`;
  if (typeof result.sectionIndex === "number") return `Section ${result.sectionIndex + 1}`;
  return "Section";
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

function normalizeLabelForCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
