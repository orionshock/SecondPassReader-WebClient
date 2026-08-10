import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadMarginaliaLayerPreferences,
  marginaliaLayerPreferencesStorageKey,
  saveMarginaliaLayerPreferences,
} from "../storage/MarginaliaLayerPreferences.Store";

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
}

describe("marginalia layer preferences", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createStorageMock(),
    });
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("saves and loads selected previous session ids per book", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);

    saveMarginaliaLayerPreferences("book-1", ["session-a", "session-b", "session-a"]);

    expect(loadMarginaliaLayerPreferences("book-1")).toEqual(["session-a", "session-b"]);
    expect(loadMarginaliaLayerPreferences("book-2")).toEqual([]);
  });

  it("removes a book entry when saving an empty selection", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    saveMarginaliaLayerPreferences("book-1", ["session-a"]);

    saveMarginaliaLayerPreferences("book-1", []);

    expect(loadMarginaliaLayerPreferences("book-1")).toEqual([]);
    expect(localStorage.getItem(marginaliaLayerPreferencesStorageKey)).toBeNull();
  });

  it("ignores malformed storage without throwing", () => {
    localStorage.setItem(marginaliaLayerPreferencesStorageKey, "{broken");

    expect(loadMarginaliaLayerPreferences("book-1")).toEqual([]);
  });

  it("prunes expired entries on read", () => {
    const nowMs = 100 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(nowMs);

    localStorage.setItem(
      marginaliaLayerPreferencesStorageKey,
      JSON.stringify({
        "book-1": {
          updatedAt: nowMs - 91 * 24 * 60 * 60 * 1000,
          selectedPreviousSessionIds: ["session-a"],
        },
      }),
    );

    expect(loadMarginaliaLayerPreferences("book-1")).toEqual([]);
    expect(localStorage.getItem(marginaliaLayerPreferencesStorageKey)).toBeNull();
  });
});
