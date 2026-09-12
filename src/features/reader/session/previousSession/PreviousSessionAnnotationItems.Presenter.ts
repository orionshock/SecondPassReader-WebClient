import type { MarginaliaAnnotation } from "@secondpass/client";
import type { ReaderHighlightMark, ReaderLocationDescription, ReaderTocItem } from "../../domain/ReaderDomain.Types";
import {
  getAnnotationColor,
  getAnnotationDescribingText,
  getAnnotationNoteText,
  getAnnotationTimestamp,
} from "../../display/ReaderAnnotation.Presenter";
import {
  toReaderAnnotation,
} from "../../annotations/ReaderAnnotation.Mapper";
import {
  getAnnotationFragmentCfi,
  isBookmarkAnnotation,
  isHighlightAnnotation,
} from "../../annotations/ReaderAnnotationSelectors.Queries";
import { toReaderCfiLocationDisplay } from "../ReadingSessionCfiDescriptions.Queries";

export type PreviousSessionLocationDescriptionCacheEntry =
  | { status: "loading" }
  | { status: "ready"; value: ReaderLocationDescription }
  | { status: "error" };

type PreviousSessionLocationLabel = {
  locationLabel?: string;
  descriptionStatus: "idle" | "loading" | "ready" | "error";
};

export type PreviousSessionAnnotationItem =
  | {
      kind: "highlight";
      id: string;
      cfiRange: string;
      text: string;
      note?: string;
      color?: string;
      timestamp?: string;
      locationLabel?: string;
      descriptionStatus: PreviousSessionLocationLabel["descriptionStatus"];
    }
  | {
      kind: "bookmark";
      id: string;
      cfi: string;
      timestamp?: string;
      locationLabel?: string;
      descriptionStatus: PreviousSessionLocationLabel["descriptionStatus"];
    };

export function toPreviousSessionHighlightMarks(annotations: MarginaliaAnnotation[], sessionId?: string): { marks: ReaderHighlightMark[]; highlightCount: number } {
  const marks: ReaderHighlightMark[] = [];
  let count = 0;
  for (const a of annotations) {
    if (!isHighlightAnnotation(a)) continue;
    const ra = toReaderAnnotation(a);
    if (ra?.kind !== "highlight") continue;
    const mark: ReaderHighlightMark = { id: ra.id, cfiRange: ra.cfiRange, text: ra.text ?? "", readOnly: true, sessionId };
    const color = getAnnotationColor(a);
    if (color) mark.color = color;
    const note = getAnnotationNoteText(a);
    if (note) mark.note = note;
    marks.push(mark);
    count += 1;
  }
  return { marks: marks.filter((m) => Boolean(m.id && m.cfiRange)), highlightCount: count };
}

function toPreviousSessionLocationLabel(input: {
  cfi: string;
  serverLocationLabel?: string;
  descriptions: Map<string, PreviousSessionLocationDescriptionCacheEntry>;
  toc: ReaderTocItem[] | null | undefined;
  bookTitle?: string | null;
}): PreviousSessionLocationLabel {
  const entry = input.descriptions.get(input.cfi);
  const locationLabel = input.serverLocationLabel || (
    entry?.status === "ready"
      ? toReaderCfiLocationDisplay({ description: entry.value, toc: input.toc, bookTitle: input.bookTitle }).locationLabel
      : undefined);
  return { locationLabel, descriptionStatus: entry?.status ?? "idle" };
}

export function toPreviousSessionItems(
  annotations: MarginaliaAnnotation[],
  descriptions: Map<string, PreviousSessionLocationDescriptionCacheEntry>,
  toc: ReaderTocItem[] | null | undefined,
  bookTitle?: string | null,
): PreviousSessionAnnotationItem[] {
  const out: PreviousSessionAnnotationItem[] = [];
  for (const a of annotations) {
    const timestamp = getAnnotationTimestamp(a) ?? undefined;
    if (isBookmarkAnnotation(a)) {
      const cfi = getAnnotationFragmentCfi(a);
      if (!cfi) continue;
      out.push({ kind: "bookmark", id: a.id, cfi, timestamp, ...toPreviousSessionLocationLabel({ cfi, serverLocationLabel: a.location.locationLabel, descriptions, toc, bookTitle }) });
      continue;
    }
    if (isHighlightAnnotation(a)) {
      const ra = toReaderAnnotation(a);
      if (ra?.kind !== "highlight") continue;
      const note = getAnnotationNoteText(a) ?? undefined;
      const color = getAnnotationColor(a) ?? undefined;
      out.push({
        kind: "highlight",
        id: ra.id,
        cfiRange: ra.cfiRange,
        text: (getAnnotationDescribingText(a) ?? ra.text ?? "").trim(),
        note,
        color,
        timestamp,
        ...toPreviousSessionLocationLabel({ cfi: ra.cfiRange, serverLocationLabel: a.location.locationLabel, descriptions, toc, bookTitle }),
      });
    }
  }
  return out;
}
