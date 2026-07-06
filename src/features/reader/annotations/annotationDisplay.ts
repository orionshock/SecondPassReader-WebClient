import type { ReadingAnnotation } from "@secondpass/client";
import { getAnnotationFragmentCfi, getAnnotationMotivations } from "./annotationSelectors";

export type AnnotationDisplay = {
  iconName: "bookmark" | "chat_bubble" | "border_color" | "edit_note";
  label: "Bookmark" | "Commented highlight" | "Highlight" | "Annotation";
};

export const BOOKMARK_DISPLAY: AnnotationDisplay = { iconName: "bookmark", label: "Bookmark" };
export const HIGHLIGHT_DISPLAY: AnnotationDisplay = { iconName: "border_color", label: "Highlight" };
export const COMMENTED_HIGHLIGHT_DISPLAY: AnnotationDisplay = {
  iconName: "chat_bubble",
  label: "Commented highlight",
};
export const FALLBACK_ANNOTATION_DISPLAY: AnnotationDisplay = { iconName: "edit_note", label: "Annotation" };

export function hasAnnotationComment(note: string | null | undefined): boolean {
  return typeof note === "string" && note.trim().length > 0;
}

export function getHighlightAnnotationDisplay(note: string | null | undefined): AnnotationDisplay {
  return hasAnnotationComment(note) ? COMMENTED_HIGHLIGHT_DISPLAY : HIGHLIGHT_DISPLAY;
}

function isRangeCfi(cfi: string | null): boolean {
  return Boolean(cfi && cfi.includes(","));
}

export function getRawAnnotationDisplay(annotation: unknown, note: string | null | undefined): AnnotationDisplay {
  const rawAnnotation = (annotation ?? {}) as ReadingAnnotation;
  const motivations = getAnnotationMotivations(rawAnnotation);
  const cfi = getAnnotationFragmentCfi(rawAnnotation);

  if (rawAnnotation.kind === "bookmark" || motivations.includes("bookmarking") || (cfi && !isRangeCfi(cfi) && !motivations.includes("highlighting") && rawAnnotation.kind !== "highlight")) {
    return BOOKMARK_DISPLAY;
  }

  if (rawAnnotation.kind === "highlight" || motivations.includes("highlighting") || isRangeCfi(cfi)) {
    return getHighlightAnnotationDisplay(note);
  }

  return FALLBACK_ANNOTATION_DISPLAY;
}
