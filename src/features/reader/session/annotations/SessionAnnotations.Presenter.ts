import type { MarginaliaAnnotation } from "@secondpass/client";
import type { ReaderHighlightMark, ReaderLocationDescription, ReaderTocItem } from "../../domain/ReaderDomain.Types";
import type { HighlightViewModel } from "../../annotations/ReaderAnnotationViewModels.Types";
import { toReaderAnnotation } from "../../annotations/ReaderAnnotation.Mapper";
import {
  getAnnotationColor,
  getAnnotationNoteText,
  getAnnotationTimestamp,
  isHighlightAnnotation,
} from "../../annotations/ReaderAnnotationSelectors.Queries";
import {
  toReaderBookmark,
  type ReaderBookmark,
} from "../../annotations/ReaderBookmark.Mapper";
import {
  toBookmarkViewModel,
  type ReaderBookmarkViewModel,
} from "../../annotations/ReaderBookmark.Presenter";
import { toReaderCfiLocationDisplay } from "../ReadingSessionCfiDescriptions.Queries";

export type SessionAnnotationDescriptionEntry = {
  status: "idle" | "loading" | "ready" | "error";
  value?: ReaderLocationDescription;
};

export type SessionAnnotationHighlight = {
  id: string;
  cfiRange: string;
  text: string;
};

export function sortSessionAnnotations(raw: MarginaliaAnnotation[]): MarginaliaAnnotation[] {
  const copy = [...raw];
  const tsMs = (annotation: MarginaliaAnnotation): number => {
    const timestamp = getAnnotationTimestamp(annotation);
    if (!timestamp) return 0;
    const milliseconds = Date.parse(timestamp);
    return Number.isFinite(milliseconds) ? milliseconds : 0;
  };
  copy.sort((a, b) => {
    const difference = tsMs(b) - tsMs(a);
    if (difference !== 0) return difference;
    return String(b.id).localeCompare(String(a.id));
  });
  return copy;
}

export function toSessionAnnotationBookmarks(sortedRaw: MarginaliaAnnotation[]): ReaderBookmark[] {
  const out: ReaderBookmark[] = [];
  for (const annotation of sortedRaw) {
    const bookmark = toReaderBookmark(annotation);
    if (bookmark) out.push(bookmark);
  }
  return out;
}

export function toSessionAnnotationHighlights(sortedRaw: MarginaliaAnnotation[]): SessionAnnotationHighlight[] {
  const out: SessionAnnotationHighlight[] = [];
  for (const annotation of sortedRaw) {
    if (!isHighlightAnnotation(annotation)) continue;
    const readerAnnotation = toReaderAnnotation(annotation);
    if (readerAnnotation?.kind !== "highlight") continue;
    out.push({
      id: readerAnnotation.id,
      cfiRange: readerAnnotation.cfiRange,
      text: readerAnnotation.text ?? "",
    });
  }
  return out;
}

export function buildSessionBookmarkViewModels(input: {
  bookmarks: ReaderBookmark[];
  sortedRaw: MarginaliaAnnotation[];
  descriptions: Record<string, SessionAnnotationDescriptionEntry>;
  currentCfi: string | null | undefined;
  currentBookProgress: number | null | undefined;
  toc: ReaderTocItem[] | null;
  bookTitle: string;
  describeCfiAvailable: boolean;
}): ReaderBookmarkViewModel[] {
  return input.bookmarks.map((bookmark) => {
    const rawAnnotation = input.sortedRaw.find((annotation) => annotation.id === bookmark.id) ?? null;
    const timestamp = rawAnnotation ? getAnnotationTimestamp(rawAnnotation) : null;
    const entry = input.descriptions[bookmark.cfi];
    return toBookmarkViewModel({
      bookmark,
      currentCfi: input.currentCfi ?? null,
      toc: input.toc,
      bookTitle: input.bookTitle,
      description: entry?.value ?? null,
      fallbackBookProgress: input.currentBookProgress ?? null,
      timestamp,
      locationLabel: rawAnnotation?.location.locationLabel,
      descriptionStatus: entry?.status ?? (input.describeCfiAvailable ? "idle" : "idle"),
    });
  });
}

export function buildSessionHighlightViewModels(input: {
  highlights: SessionAnnotationHighlight[];
  sortedRaw: MarginaliaAnnotation[];
  descriptions: Record<string, SessionAnnotationDescriptionEntry>;
  toc: ReaderTocItem[] | null;
  bookTitle: string;
}): HighlightViewModel[] {
  return input.highlights.map((highlight) => {
    const rawAnnotation = input.sortedRaw.find((annotation) => annotation.id === highlight.id) ?? null;
    const note = rawAnnotation ? getAnnotationNoteText(rawAnnotation) : null;
    const color = rawAnnotation ? getAnnotationColor(rawAnnotation) : null;
    const timestamp = rawAnnotation ? getAnnotationTimestamp(rawAnnotation) : null;
    const entry = input.descriptions[highlight.cfiRange];
    const locationDisplay = toReaderCfiLocationDisplay({
      description: entry?.value ?? null,
      toc: input.toc,
      bookTitle: input.bookTitle,
    });

    return {
      kind: "highlight" as const,
      id: highlight.id,
      cfiRange: highlight.cfiRange,
      text: highlight.text,
      note: note ?? undefined,
      color: color ?? undefined,
      timestamp: timestamp ?? undefined,
      label: rawAnnotation?.location.locationLabel || locationDisplay.label,
      labelParts: rawAnnotation?.location.locationLabel
        ? [rawAnnotation.location.locationLabel]
        : locationDisplay.labelParts,
      descriptionStatus: entry?.status ?? "idle",
    };
  });
}

export function buildSessionHighlightMarks(highlights: HighlightViewModel[]): ReaderHighlightMark[] {
  return highlights
    .map((highlight) => ({
      id: highlight.id,
      cfiRange: highlight.cfiRange,
      color: highlight.color,
      text: highlight.text,
      note: highlight.note,
    }))
    .filter((mark) => Boolean(mark.id && mark.cfiRange));
}

export function sortSessionAnnotationItems(
  bookmarkViewModels: ReaderBookmarkViewModel[],
  highlightViewModels: HighlightViewModel[],
): Array<ReaderBookmarkViewModel | HighlightViewModel> {
  const combined: Array<any> = [...bookmarkViewModels, ...highlightViewModels];
  const tsMs = (viewModel: { timestamp?: string; id: string }): number => {
    const timestamp = typeof viewModel.timestamp === "string" ? viewModel.timestamp.trim() : "";
    if (!timestamp) return 0;
    const milliseconds = Date.parse(timestamp);
    return Number.isFinite(milliseconds) ? milliseconds : 0;
  };
  combined.sort((a, b) => {
    const difference = tsMs(b) - tsMs(a);
    if (difference !== 0) return difference;
    return String(b.id).localeCompare(String(a.id));
  });
  return combined as Array<ReaderBookmarkViewModel | HighlightViewModel>;
}
