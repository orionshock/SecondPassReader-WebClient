import { describe, expect, it, vi } from "vitest";
import { probeReaderImportBookmarkCfi } from "../../../features/reader/imports/ReaderImportBookmarkProbe.Actions";

describe("reader import bookmark CFI probe", () => {
  it("returns staged when a bookmark CFI probe succeeds", async () => {
    const probeCfi = vi.fn(async () => ({ ok: true as const, code: "exists-in-book" as const, description: "chapter.xhtml" }));
    const displayCfi = vi.fn(async () => ({ ok: true as const, code: "displayed" as const }));

    const result = await probeReaderImportBookmarkCfi({ cfiHint: " epubcfi(/6/2) ", probeCfi, displayCfi, isCurrent: () => true });

    expect(probeCfi).toHaveBeenCalledWith("epubcfi(/6/2)");
    expect(displayCfi).toHaveBeenCalledWith("epubcfi(/6/2)", { navigationIntent: "import-staging" });
    expect(result).toEqual({ status: "staged", result: { ok: true, code: "displayed" } });
  });

  it("returns not-found when a bookmark CFI probe fails", async () => {
    const probeCfi = vi.fn(async () => ({ ok: false as const, code: "invalid" as const, error: "Invalid CFI" }));

    const displayCfi = vi.fn();
    const result = await probeReaderImportBookmarkCfi({ cfiHint: "epubcfi(/bad)", probeCfi, displayCfi, isCurrent: () => true });

    expect(probeCfi).toHaveBeenCalledWith("epubcfi(/bad)");
    expect(displayCfi).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "not-found", result: { ok: false, code: "invalid", error: "Invalid CFI" } });
  });

  it("returns not-found without probing when no bookmark CFI hint exists", async () => {
    const probeCfi = vi.fn(async () => ({ ok: true as const, code: "exists-in-book" as const }));

    const result = await probeReaderImportBookmarkCfi({ cfiHint: " ", probeCfi, displayCfi: vi.fn(), isCurrent: () => true });

    expect(probeCfi).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "not-found", result: { ok: false, code: "invalid", error: "Bookmark row has no CFI hint." } });
  });

  it("returns not-found without throwing when CFI probing is unavailable", async () => {
    const result = await probeReaderImportBookmarkCfi({ cfiHint: "epubcfi(/6/2)", probeCfi: null, displayCfi: vi.fn(), isCurrent: () => true });

    expect(result).toEqual({ status: "not-found", result: { ok: false, code: "unsupported", error: "CFI probe is unavailable." } });
  });

  it("maps thrown probe errors to not-found", async () => {
    const result = await probeReaderImportBookmarkCfi({
      cfiHint: "epubcfi(/6/2)",
      probeCfi: async () => {
        throw new Error("Probe exploded");
      },
      displayCfi: vi.fn(),
      isCurrent: () => true,
    });

    expect(result).toEqual({ status: "not-found", result: { ok: false, code: "resolution-failed", error: "Probe exploded" } });
  });

  it("returns not-found when display fails after a successful probe", async () => {
    const result = await probeReaderImportBookmarkCfi({
      cfiHint: "epubcfi(/6/2)",
      probeCfi: async () => ({ ok: true, code: "exists-in-book" }),
      displayCfi: async () => ({ ok: false, code: "display-failed", error: "No display" }),
      isCurrent: () => true,
    });
    expect(result).toEqual({ status: "not-found", result: { ok: false, code: "display-failed", error: "No display" } });
  });

  it("does not navigate when ownership is lost during bookmark probing", async () => {
    let resolveProbe: ((value: { ok: true; code: "exists-in-book" }) => void) | undefined;
    const probe = new Promise<{ ok: true; code: "exists-in-book" }>((resolve) => { resolveProbe = resolve; });
    let current = true;
    const displayCfi = vi.fn(async () => ({ ok: true as const, code: "displayed" as const }));
    const resultPromise = probeReaderImportBookmarkCfi({
      cfiHint: "epubcfi(/6/2)",
      probeCfi: () => probe,
      displayCfi,
      isCurrent: () => current,
    });

    current = false;
    resolveProbe?.({ ok: true, code: "exists-in-book" });

    await expect(resultPromise).resolves.toBeNull();
    expect(displayCfi).not.toHaveBeenCalled();
  });
});
