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
