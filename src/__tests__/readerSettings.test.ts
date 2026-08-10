import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReaderSettings,
  normalizeReaderSettings,
  saveReaderSettings,
} from "../storage/ReaderSettings.Store";

function installLocalStorage(initialValue: string | null = null) {
  let value = initialValue;
  const storage = {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
  vi.stubGlobal("localStorage", storage);
  return { storage, read: () => value };
}

describe("reader settings storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not include an unused page margin in defaults", () => {
    expect(normalizeReaderSettings(undefined)).toEqual({
      fontSizePercent: 100,
      theme: "light",
      readerWidth: "normal",
      lineHeight: "normal",
      fontFamily: "publisher",
    });
  });

  it("ignores page margin from old persisted settings", () => {
    installLocalStorage(JSON.stringify({
      fontSizePercent: 120,
      theme: "dark",
      readerWidth: "wide",
      lineHeight: "spacious",
      fontFamily: "serif",
      pageMargin: "wide",
    }));

    expect(getReaderSettings()).toEqual({
      fontSizePercent: 120,
      theme: "dark",
      readerWidth: "wide",
      lineHeight: "spacious",
      fontFamily: "serif",
    });
  });

  it("does not write page margin when saving settings", () => {
    const local = installLocalStorage();
    saveReaderSettings({
      fontSizePercent: 110,
      theme: "sepia",
      readerWidth: "narrow",
      lineHeight: "compact",
      fontFamily: "sans",
    });

    expect(JSON.parse(local.read() ?? "null")).toEqual({
      fontSizePercent: 110,
      theme: "sepia",
      readerWidth: "narrow",
      lineHeight: "compact",
      fontFamily: "sans",
    });
    expect(local.storage.setItem).toHaveBeenCalledOnce();
  });
});
