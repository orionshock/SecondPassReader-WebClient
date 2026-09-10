import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReaderSettings,
  normalizeReaderSettings,
  saveReaderSettings,
} from "../../storage/ReaderSettings.Store";

function installLocalStorage(initialValue: string | null = null, writeError?: Error) {
  let value = initialValue;
  const storage = {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      if (writeError) throw writeError;
      value = next;
    }),
  };
  vi.stubGlobal("localStorage", storage);
  return { storage, read: () => value };
}

describe("reader settings storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the complete supported default settings schema", () => {
    expect(normalizeReaderSettings(undefined)).toEqual({
      fontSizePercent: 100,
      theme: "light",
      readerWidth: "normal",
      lineHeight: "normal",
      fontFamily: "publisher",
    });
  });

  it("loads persisted supported settings", () => {
    installLocalStorage(JSON.stringify({
      fontSizePercent: 120,
      theme: "dark",
      readerWidth: "wide",
      lineHeight: "spacious",
      fontFamily: "serif",
    }));

    expect(getReaderSettings()).toEqual({
      fontSizePercent: 120,
      theme: "dark",
      readerWidth: "wide",
      lineHeight: "spacious",
      fontFamily: "serif",
    });
  });

  it("falls back safely when persisted settings are malformed", () => {
    installLocalStorage("{not-json");

    expect(getReaderSettings()).toMatchObject({
      fontSizePercent: 100,
      theme: "light",
      readerWidth: "normal",
    });
  });

  it("round-trips supported values through storage", () => {
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

  it("does not crash when browser storage rejects a write", () => {
    installLocalStorage(null, new Error("quota exceeded"));

    expect(() => saveReaderSettings({
      fontSizePercent: 110,
      theme: "sepia",
      readerWidth: "narrow",
      lineHeight: "compact",
      fontFamily: "sans",
    })).not.toThrow();
  });
});
