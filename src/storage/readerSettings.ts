export type ReaderTheme = "light" | "sepia" | "dark";
export type ReaderWidth = "narrow" | "normal" | "wide";
export type ReaderLineHeight = "compact" | "normal" | "relaxed" | "loose";
export type ReaderFontFamily = "publisher" | "serif" | "sans";
export type ReaderPageMargin = "compact" | "normal" | "wide";

export type ReaderSettings = {
  fontSizePercent: number;
  theme: ReaderTheme;
  readerWidth: ReaderWidth;
  lineHeight: ReaderLineHeight;
  fontFamily: ReaderFontFamily;
  pageMargin: ReaderPageMargin;
};

const STORAGE_KEY = "secondpass.readerSettings.v1";

const DEFAULTS: ReaderSettings = {
  fontSizePercent: 100,
  theme: "light",
  readerWidth: "normal",
  lineHeight: "normal",
  fontFamily: "publisher",
  pageMargin: "normal",
};

export const FONT_SIZE_MIN = 75;
export const FONT_SIZE_MAX = 180;

function clampFontSizePercent(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULTS.fontSizePercent;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));
}

function isTheme(value: unknown): value is ReaderTheme {
  return value === "light" || value === "sepia" || value === "dark";
}

function isWidth(value: unknown): value is ReaderWidth {
  return value === "narrow" || value === "normal" || value === "wide";
}

function isLineHeight(value: unknown): value is ReaderLineHeight {
  return value === "compact" || value === "normal" || value === "relaxed" || value === "loose";
}

function isFontFamily(value: unknown): value is ReaderFontFamily {
  return value === "publisher" || value === "serif" || value === "sans";
}

function isPageMargin(value: unknown): value is ReaderPageMargin {
  return value === "compact" || value === "normal" || value === "wide";
}

export function normalizeReaderSettings(input: Partial<ReaderSettings> | null | undefined): ReaderSettings {
  return {
    fontSizePercent: clampFontSizePercent(input?.fontSizePercent),
    theme: isTheme(input?.theme) ? input.theme : DEFAULTS.theme,
    readerWidth: isWidth(input?.readerWidth) ? input.readerWidth : DEFAULTS.readerWidth,
    lineHeight: isLineHeight((input as any)?.lineHeight) ? (input as any).lineHeight : DEFAULTS.lineHeight,
    fontFamily: isFontFamily((input as any)?.fontFamily) ? (input as any).fontFamily : DEFAULTS.fontFamily,
    pageMargin: isPageMargin((input as any)?.pageMargin) ? (input as any).pageMargin : DEFAULTS.pageMargin,
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
    // ignore storage errors
  }
}

export function resetReaderSettings(): ReaderSettings {
  const defaults = { ...DEFAULTS };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {
    // ignore storage errors
  }
  return defaults;
}
