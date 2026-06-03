import type { ReaderFontFamily, ReaderLineHeight, ReaderSettings, ReaderTheme, ReaderWidth } from "../../../storage/readerSettings";
import { READER_FONT_SIZE_OPTIONS } from "../../../storage/readerSettings";

export const READER_THEME_OPTIONS: Array<{ value: ReaderTheme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "sepia", label: "Sepia" },
  { value: "dark", label: "Dark" },
];

export const READER_FONT_OPTIONS: Array<{ value: ReaderFontFamily; label: string }> = [
  { value: "publisher", label: "Publisher" },
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
];

export const READER_FONT_SIZE_OPTION_LABELS: Array<{ value: ReaderSettings["fontSizePercent"]; label: string }> =
  READER_FONT_SIZE_OPTIONS.map((value) => ({ value, label: `${value}%` }));

export const READER_LINE_HEIGHT_OPTIONS: Array<{ value: ReaderLineHeight; label: string }> = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "spacious", label: "Spacious" },
];

export const READER_WIDTH_OPTIONS: Array<{ value: ReaderWidth; label: string }> = [
  { value: "narrow", label: "Narrow" },
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Wide" },
];

export function getReaderFontSizeScale(settings: ReaderSettings): string {
  return String(settings.fontSizePercent / 100);
}

export function getReaderLineHeightCssValue(lineHeight: ReaderLineHeight): string {
  switch (lineHeight) {
    case "compact":
      return "1.35";
    case "spacious":
      return "1.75";
    case "normal":
      return "1.55";
  }
}

export function getReaderFontFamilyCssValue(fontFamily: ReaderFontFamily): string | null {
  switch (fontFamily) {
    case "serif":
      return 'Georgia, "Times New Roman", Times, serif';
    case "sans":
      return 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    case "publisher":
      return null;
  }
}

export function getReaderEpubThemeRules(theme: ReaderTheme): Record<string, Record<string, string>> {
  switch (theme) {
    case "sepia":
      return {
        "html, body": {
          "background-color": "#f3ead7",
          color: "#2f261b",
        },
        a: {
          color: "#7c4f17",
        },
      };
    case "dark":
      return {
        "html, body": {
          "background-color": "#101418",
          color: "#eef2f5",
        },
        a: {
          color: "#93c5fd",
        },
      };
    case "light":
      return {
        "html, body": {
          "background-color": "#ffffff",
          color: "#111827",
        },
        a: {
          color: "#2563eb",
        },
      };
  }
}

export function getReaderEpubDisplayRules(settings: ReaderSettings): Record<string, Record<string, string>> {
  const lineHeight = getReaderLineHeightCssValue(settings.lineHeight);
  const fontFamily = getReaderFontFamilyCssValue(settings.fontFamily);
  const textRules: Record<string, string> = {
    "line-height": lineHeight,
  };

  if (fontFamily) textRules["font-family"] = fontFamily;

  return {
    "body, p, li, blockquote, dd, dt, div": textRules,
    "h1, h2, h3, h4, h5, h6": {
      "line-height": settings.lineHeight === "compact" ? "1.15" : settings.lineHeight === "spacious" ? "1.35" : "1.25",
    },
  };
}
