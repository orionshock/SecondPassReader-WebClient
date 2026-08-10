import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEBUG_LOG_STORAGE_KEY,
  debugLog,
  getEnabledDebugCategories,
  isDebugEnabled,
  setEnabledDebugCategories,
} from "../lib/debug/DebugLogger.Diagnostics";

describe("DebugLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps logging disabled when browser storage has no debug setting", () => {
    installStorage();
    const consoleDebug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    expect(isDebugEnabled("imports")).toBe(false);
    expect(isDebugEnabled("staged-selection")).toBe(false);
    expect(isDebugEnabled("reader")).toBe(false);
    debugLog("reader", "hidden");
    expect(consoleDebug).not.toHaveBeenCalled();
  });

  it.each(["*", "all"])("enables every category with %s", (value) => {
    installStorage({ [DEBUG_LOG_STORAGE_KEY]: value });

    expect(getEnabledDebugCategories()).toEqual(["imports", "staged-selection", "reader"]);
  });

  it("enables only named comma-separated categories", () => {
    installStorage({ [DEBUG_LOG_STORAGE_KEY]: "imports, reader" });
    const consoleDebug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    expect(isDebugEnabled("imports")).toBe(true);
    expect(isDebugEnabled("reader")).toBe(true);
    expect(isDebugEnabled("staged-selection")).toBe(false);
    debugLog("imports", "enabled", { count: 2 });
    debugLog("staged-selection", "hidden");
    expect(consoleDebug).toHaveBeenCalledOnce();
    expect(consoleDebug).toHaveBeenCalledWith("[SPR imports] enabled", { count: 2 });
  });

  it("fails closed for invalid settings and unavailable localStorage", () => {
    installStorage({ [DEBUG_LOG_STORAGE_KEY]: "wat,unknown" });
    expect(getEnabledDebugCategories()).toEqual([]);

    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("blocked");
      },
    });

    expect(isDebugEnabled("imports")).toBe(false);
    expect(() => setEnabledDebugCategories(["reader"])).not.toThrow();
  });

  it("writes enabled categories to the primary setting", () => {
    const storage = installStorage();

    setEnabledDebugCategories(["reader"]);

    expect(storage.getItem(DEBUG_LOG_STORAGE_KEY)).toBe("reader");
  });
});

function installStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  const storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } satisfies Storage;
  vi.stubGlobal("window", { localStorage: storage });
  return storage;
}
