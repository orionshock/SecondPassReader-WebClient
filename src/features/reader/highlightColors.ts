export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "purple", "orange"] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "yellow";

export function isHighlightColor(value: unknown): value is HighlightColor {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return (HIGHLIGHT_COLORS as readonly string[]).includes(v);
}

export function highlightColorLabel(color: HighlightColor): string {
  switch (color) {
    case "yellow":
      return "Yellow";
    case "green":
      return "Green";
    case "blue":
      return "Blue";
    case "pink":
      return "Pink";
    case "purple":
      return "Purple";
    case "orange":
      return "Orange";
  }
}

export function highlightColorToClassName(color: HighlightColor): string {
  switch (color) {
    case "yellow":
      return "highlightColorYellow";
    case "green":
      return "highlightColorGreen";
    case "blue":
      return "highlightColorBlue";
    case "pink":
      return "highlightColorPink";
    case "purple":
      return "highlightColorPurple";
    case "orange":
      return "highlightColorOrange";
  }
}

