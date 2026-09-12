import type { MarginaliaAnnotation } from "@secondpass/client";
import {
  getAnnotationDescribingText,
  getAnnotationNoteText,
} from "../annotations/ReaderAnnotationSelectors.Queries";

const NAMED_COLORS: Record<string, string> = {
  yellow: "#facc15",
  green: "#22c55e",
  blue: "#3b82f6",
  pink: "#ec4899",
  purple: "#a855f7",
  orange: "#f97316",
  red: "#ef4444",
};

type AnnotationDisplay = {
  iconName: "bookmark" | "chat_bubble" | "border_color";
  label: "Bookmark" | "Commented highlight" | "Highlight";
};

export const BOOKMARK_DISPLAY: AnnotationDisplay = { iconName: "bookmark", label: "Bookmark" };
const HIGHLIGHT_DISPLAY: AnnotationDisplay = { iconName: "border_color", label: "Highlight" };
const COMMENTED_HIGHLIGHT_DISPLAY: AnnotationDisplay = {
  iconName: "chat_bubble",
  label: "Commented highlight",
};

export function getAnnotationDisplayTexts(annotation: MarginaliaAnnotation): {
  quote: string | null;
  note: string | null;
} {
  return {
    quote: getAnnotationDescribingText(annotation),
    note: getAnnotationNoteText(annotation),
  };
}

function hasAnnotationComment(note: string | null | undefined): boolean {
  return typeof note === "string" && note.trim().length > 0;
}

export function getHighlightAnnotationDisplay(note: string | null | undefined): AnnotationDisplay {
  return hasAnnotationComment(note) ? COMMENTED_HIGHLIGHT_DISPLAY : HIGHLIGHT_DISPLAY;
}

export function getRawAnnotationDisplay(
  annotation: MarginaliaAnnotation,
  note: string | null | undefined,
): AnnotationDisplay {
  return annotation.kind === "bookmark" ? BOOKMARK_DISPLAY : getHighlightAnnotationDisplay(note);
}

export function resolveAnnotationColor(inputColor: string | null | undefined): string | null {
  const raw = typeof inputColor === "string" ? inputColor : "";
  const normalized = raw ? raw.trim().toLowerCase() : "";
  const resolved = normalized && (NAMED_COLORS[normalized] ?? (normalized.startsWith("#") ? normalized : ""));
  return resolved && hexToRgb(resolved) ? resolved : null;
}

export function toAnnotationCssVars(inputColor: string | null | undefined): { color: string; bg: string } {
  const resolved = resolveAnnotationColor(inputColor);
  const base = resolved ? hexToRgb(resolved) : null;
  if (!base) {
    return {
      color: "rgba(59, 130, 246, 0.55)",
      bg: "rgba(59, 130, 246, 0.08)",
    };
  }
  return {
    color: `rgba(${base.r}, ${base.g}, ${base.b}, 0.55)`,
    bg: `rgba(${base.r}, ${base.g}, ${base.b}, 0.10)`,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace(/^#/, "");
  const isShort = h.length === 3;
  const isLong = h.length === 6;
  if (!isShort && !isLong) return null;
  const full = isShort ? h.split("").map((character) => character + character).join("") : h;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return null;
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}
