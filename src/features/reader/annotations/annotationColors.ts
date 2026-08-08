const NAMED_COLORS: Record<string, string> = {
  yellow: "#facc15",
  green: "#22c55e",
  blue: "#3b82f6",
  pink: "#ec4899",
  purple: "#a855f7",
  orange: "#f97316",
  red: "#ef4444",
};

export const ANNOTATION_COLOR_TOKENS = ["yellow", "green", "blue", "pink", "purple", "orange"] as const;
export type AnnotationColorToken = (typeof ANNOTATION_COLOR_TOKENS)[number];

function normalizeColor(input: string): string {
  return input.trim().toLowerCase();
}

export function resolveAnnotationColor(inputColor: string | null | undefined): string | null {
  const raw = typeof inputColor === "string" ? inputColor : "";
  const normalized = raw ? normalizeColor(raw) : "";
  const resolved = normalized && (NAMED_COLORS[normalized] ?? (normalized.startsWith("#") ? normalized : ""));
  return resolved && hexToRgb(resolved) ? resolved : null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace(/^#/, "");
  const isShort = h.length === 3;
  const isLong = h.length === 6;
  if (!isShort && !isLong) return null;
  const full = isShort ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Convert an annotation "color" token into safe CSS variables:
 * - `color` for borders/bars
 * - `bg` for a lightly tinted background
 *
 * This intentionally handles only a small set of named tokens and hex colors.
 * Unknown values fall back to a neutral theme color.
 */
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
