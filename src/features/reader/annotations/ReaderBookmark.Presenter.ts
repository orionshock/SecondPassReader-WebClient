import type { ReaderLocationDescription, ReaderTocItem } from "../domain/ReaderDomain.Types";
import { toReaderCfiLocationDisplay } from "../session/ReadingSessionCfiDescriptions.Queries";
import type { ReaderBookmark } from "./ReaderBookmark.Mapper";

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

function formatPercent(bookProgress: number): string {
  const pct = Math.round(bookProgress * 100);
  return `${pct}%`;
}

export function deriveBookmarkLabel(input: {
  chapterLabel?: string | null;
  bookProgress?: number | null | undefined;
}): string {
  return deriveBookmarkLabelParts(input).join(" ");
}

function deriveBookmarkLabelParts(input: {
  chapterLabel?: string | null;
  bookProgress?: number | null | undefined;
}): string[] {
  const chapter = input.chapterLabel?.trim() ? input.chapterLabel.trim() : null;
  const p = input.bookProgress;
  const hasProgress = typeof p === "number" && Number.isFinite(p);
  const progressText = hasProgress ? formatPercent(p) : null;

  if (chapter && progressText) return [chapter, progressText];
  if (chapter) return [chapter];
  if (progressText) return ["Saved location", progressText];
  return ["Saved location"];
}

export function toBookmarkViewModel(input: {
  bookmark: ReaderBookmark;
  currentCfi?: string | null;
  toc?: ReaderTocItem[] | null;
  bookTitle?: string | null;
  description?: ReaderLocationDescription | null;
  fallbackBookProgress?: number | null | undefined;
  timestamp?: string | null;
  locationLabel?: string;
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
    label: input.locationLabel || locationDisplay.label,
    labelParts: input.locationLabel ? [input.locationLabel] : locationDisplay.labelParts,
    timestamp: input.timestamp ?? undefined,
    isCurrent,
    descriptionStatus: input.descriptionStatus,
  };
}
