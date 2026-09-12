export type ReaderTheme = "light" | "sepia" | "dark";
export type ReaderWidth = "narrow" | "normal" | "wide";
export type ReaderLineHeight = "compact" | "normal" | "spacious";
export type ReaderFontFamily = "publisher" | "serif" | "sans";

export type ReaderSettings = {
  fontSizePercent: number;
  theme: ReaderTheme;
  readerWidth: ReaderWidth;
  lineHeight: ReaderLineHeight;
  fontFamily: ReaderFontFamily;
};

const STORAGE_KEY = "secondpass.readerSettings.v1";

const DEFAULTS: ReaderSettings = {
  fontSizePercent: 100,
  theme: "light",
  readerWidth: "normal",
  lineHeight: "normal",
  fontFamily: "publisher",
};

export const READER_FONT_SIZE_OPTIONS = [90, 100, 110, 120, 140] as const;
export type ReaderFontSizePercent = (typeof READER_FONT_SIZE_OPTIONS)[number];

function clampFontSizePercent(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULTS.fontSizePercent;
  const rounded = Math.round(n);
  return READER_FONT_SIZE_OPTIONS.reduce((best, option) => {
    return Math.abs(option - rounded) < Math.abs(best - rounded) ? option : best;
  }, READER_FONT_SIZE_OPTIONS[0]);
}

function isTheme(value: unknown): value is ReaderTheme {
  return value === "light" || value === "sepia" || value === "dark";
}

function isWidth(value: unknown): value is ReaderWidth {
  return value === "narrow" || value === "normal" || value === "wide";
}

function normalizeLineHeight(value: unknown): ReaderLineHeight {
  if (value === "compact" || value === "normal" || value === "spacious") return value;
  if (value === "relaxed" || value === "loose") return "spacious";
  return DEFAULTS.lineHeight;
}

function isFontFamily(value: unknown): value is ReaderFontFamily {
  return value === "publisher" || value === "serif" || value === "sans";
}

export function normalizeReaderSettings(input: Partial<ReaderSettings> | null | undefined): ReaderSettings {
  return {
    fontSizePercent: clampFontSizePercent(input?.fontSizePercent),
    theme: isTheme(input?.theme) ? input.theme : DEFAULTS.theme,
    readerWidth: isWidth(input?.readerWidth) ? input.readerWidth : DEFAULTS.readerWidth,
    lineHeight: normalizeLineHeight((input as any)?.lineHeight),
    fontFamily: isFontFamily((input as any)?.fontFamily) ? (input as any).fontFamily : DEFAULTS.fontFamily,
  };
}

export function getReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULTS };
    return normalizeReaderSettings(parsed as Partial<ReaderSettings>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  try {
    const normalized = normalizeReaderSettings(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // The in-memory setting remains usable when browser preference storage is unavailable.
  }
}

export function resetReaderSettings(): ReaderSettings {
  const defaults = { ...DEFAULTS };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {
    // Reset still returns usable defaults when browser preference storage is unavailable.
  }
  return defaults;
}
