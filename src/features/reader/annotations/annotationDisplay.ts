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

function normalizeMotivations(motivation: unknown): string[] {
  if (Array.isArray(motivation)) return motivation.filter((m): m is string => typeof m === "string").map((m) => m.toLowerCase());
  if (typeof motivation === "string") return [motivation.toLowerCase()];
  return [];
}

function getFragmentSelectorValue(selector: unknown): string | null {
  if (!selector || typeof selector !== "object") return null;
  const anySelector = selector as { type?: unknown; value?: unknown };
  if (anySelector.type !== "FragmentSelector") return null;
  if (typeof anySelector.value !== "string") return null;
  const value = anySelector.value.trim();
  return value || null;
}

function getFragmentCfi(annotation: unknown): string | null {
  const selector = (annotation as { target?: { selector?: unknown } } | null | undefined)?.target?.selector;
  if (Array.isArray(selector)) {
    for (const item of selector) {
      const value = getFragmentSelectorValue(item);
      if (value) return value;
    }
    return null;
  }
  return getFragmentSelectorValue(selector);
}

function isRangeCfi(cfi: string | null): boolean {
  return Boolean(cfi && cfi.includes(","));
}

export function getRawAnnotationDisplay(annotation: unknown, note: string | null | undefined): AnnotationDisplay {
  const motivations = normalizeMotivations((annotation as { motivation?: unknown } | null | undefined)?.motivation);
  const cfi = getFragmentCfi(annotation);

  if (motivations.includes("bookmarking") || (cfi && !isRangeCfi(cfi) && !motivations.includes("highlighting"))) {
    return BOOKMARK_DISPLAY;
  }

  if (motivations.includes("highlighting") || isRangeCfi(cfi)) {
    return getHighlightAnnotationDisplay(note);
  }

  return FALLBACK_ANNOTATION_DISPLAY;
}
