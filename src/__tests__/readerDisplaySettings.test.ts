import { describe, expect, it } from "vitest";
import type { ReaderSettings } from "../storage/readerSettings";
import { getReaderSettingsPresentation } from "../features/reader/settings/readerDisplaySettings";

describe("reader display settings presentation", () => {
  it("maps EPUB typography into the rendition payload", () => {
    const presentation = getReaderSettingsPresentation(settings({
      fontFamily: "serif",
      fontSizePercent: 120,
      lineHeight: "spacious",
    }));

    expect(presentation.epub.fontFamily).toBe('Georgia, "Times New Roman", Times, serif');
    expect(presentation.epub.fontSize).toBe("120%");
    expect(presentation.epub.lineHeight).toBe("1.75");
    expect(presentation.epub.rules["body, p, li, blockquote, dd, dt, div"]).toEqual({
      "font-family": 'Georgia, "Times New Roman", Times, serif !important',
      "line-height": "1.75 !important",
    });
  });

  it("keeps activity theme and EPUB viewport width separate from typography", () => {
    const presentation = getReaderSettingsPresentation(settings({
      theme: "dark",
      readerWidth: "narrow",
      fontFamily: "sans",
      fontSizePercent: 140,
      lineHeight: "compact",
    }));

    expect(presentation.activity).toEqual({ theme: "dark" });
    expect(presentation.viewport).toEqual({ width: "narrow" });
    expect(presentation.epub.rules["html, body"]).toEqual({
      "background-color": "#101418",
      color: "#eef2f5",
    });
    expect(presentation.activity).not.toHaveProperty("fontFamily");
    expect(presentation.activity).not.toHaveProperty("fontSizePercent");
    expect(presentation.activity).not.toHaveProperty("lineHeight");
    expect(presentation.viewport).not.toHaveProperty("theme");
  });
});

function settings(overrides: Partial<ReaderSettings>): ReaderSettings {
  return {
    fontSizePercent: 100,
    theme: "light",
    readerWidth: "normal",
    lineHeight: "normal",
    fontFamily: "publisher",
    ...overrides,
  };
}
