import type { ReaderLocationDescription, ReaderTocItem } from "../domain/types";
import { getReaderLocationTocLabel } from "../display/ReaderLocation.Presenter";

export type ReaderDescribeCfi = (cfi: string) => Promise<ReaderLocationDescription>;

export type ReaderCfiLocationDisplay = {
  description: ReaderLocationDescription | null;
  locationLabel?: string;
  progressPercent?: number;
  progressText?: string;
  labelParts: string[];
  label: string;
};

export function getCfiDescriptionCandidates(cfi: string): string[] {
  const trimmed = cfi.trim();
  if (!trimmed) return [];
  const candidates = [trimmed];
  const startCfi = getRangeStartCfi(trimmed);
  if (startCfi && startCfi !== trimmed) candidates.push(startCfi);
  return candidates;
}

export async function describeCfiBestEffort(describeCfi: ReaderDescribeCfi, cfi: string): Promise<ReaderLocationDescription> {
  let fallback: ReaderLocationDescription | null = null;
  let lastError: unknown = null;

  for (const candidate of getCfiDescriptionCandidates(cfi)) {
    try {
      const description = await describeCfi(candidate);
      const normalized = { ...description, cfi };
      if (description.href) return normalized;
      fallback = fallback ?? normalized;
    } catch (error) {
      lastError = error;
    }
  }

  if (fallback) return fallback;
  throw lastError instanceof Error ? lastError : new Error("Failed to describe CFI.");
}

export async function describeReaderCfiLocation(input: {
  cfi: string;
  describeCfi: ReaderDescribeCfi;
  toc: ReaderTocItem[] | null | undefined;
  bookTitle?: string | null;
}): Promise<ReaderCfiLocationDisplay> {
  const description = await describeCfiBestEffort(input.describeCfi, input.cfi);
  return toReaderCfiLocationDisplay({
    description,
    toc: input.toc,
    bookTitle: input.bookTitle,
  });
}

export function toReaderCfiLocationDisplay(input: {
  description: ReaderLocationDescription | null | undefined;
  toc: ReaderTocItem[] | null | undefined;
  bookTitle?: string | null;
}): ReaderCfiLocationDisplay {
  const description = input.description ?? null;
  const locationLabel = getReaderLocationTocLabel({
    toc: input.toc,
    href: description?.href,
    bookTitle: input.bookTitle,
  }) ?? undefined;
  const progressPercent =
    typeof description?.bookProgress === "number" && Number.isFinite(description.bookProgress)
      ? description.bookProgress
      : undefined;
  const progressText = typeof progressPercent === "number" ? formatProgressPercent(progressPercent) : undefined;
  const labelParts = [locationLabel, progressText].filter((part): part is string => Boolean(part));
  return {
    description,
    locationLabel,
    progressPercent,
    progressText,
    labelParts,
    label: labelParts.join(" ") || "Saved location",
  };
}

function formatProgressPercent(bookProgress: number): string {
  return `${Math.round(bookProgress * 100)}%`;
}

function getRangeStartCfi(cfi: string): string | null {
  const prefix = "epubcfi(";
  if (!cfi.startsWith(prefix) || !cfi.endsWith(")")) return null;

  const inner = cfi.slice(prefix.length, -1);
  const parts = inner.split(",");
  if (parts.length < 2) return null;

  if (parts.length === 2) {
    const start = parts[0]?.trim();
    return start ? `${prefix}${start})` : null;
  }

  const base = parts[0]?.trim();
  const start = parts[1]?.trim();
  if (!base || !start) return null;
  return `${prefix}${base}${start})`;
}
