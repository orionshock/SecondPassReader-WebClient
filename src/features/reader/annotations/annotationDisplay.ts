import type { MarginaliaAnnotation } from "@secondpass/client";

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

export function getRawAnnotationDisplay(annotation: MarginaliaAnnotation, note: string | null | undefined): AnnotationDisplay {
  return annotation.kind === "bookmark" ? BOOKMARK_DISPLAY : getHighlightAnnotationDisplay(note);
}
