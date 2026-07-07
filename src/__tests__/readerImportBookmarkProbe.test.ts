import { describe, expect, it, vi } from "vitest";
import { probeReaderImportBookmarkCfi } from "../features/reader/imports/readerImportBookmarkProbe";

describe("reader import bookmark CFI probe", () => {
  it("returns staged when a bookmark CFI probe succeeds", async () => {
    const probeCfi = vi.fn(async () => ({ ok: true as const, code: "exists-in-book" as const, description: "chapter.xhtml" }));

    const result = await probeReaderImportBookmarkCfi({ cfiHint: " epubcfi(/6/2) ", probeCfi });

    expect(probeCfi).toHaveBeenCalledWith("epubcfi(/6/2)");
    expect(result).toEqual({ status: "staged", result: { ok: true, code: "exists-in-book", description: "chapter.xhtml" } });
  });

  it("returns not-found when a bookmark CFI probe fails", async () => {
    const probeCfi = vi.fn(async () => ({ ok: false as const, code: "invalid" as const, error: "Invalid CFI" }));

    const result = await probeReaderImportBookmarkCfi({ cfiHint: "epubcfi(/bad)", probeCfi });

    expect(probeCfi).toHaveBeenCalledWith("epubcfi(/bad)");
    expect(result).toEqual({ status: "not-found", result: { ok: false, code: "invalid", error: "Invalid CFI" } });
  });

  it("returns not-found without probing when no bookmark CFI hint exists", async () => {
    const probeCfi = vi.fn(async () => ({ ok: true as const, code: "exists-in-book" as const }));

    const result = await probeReaderImportBookmarkCfi({ cfiHint: " ", probeCfi });

    expect(probeCfi).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "not-found", result: { ok: false, code: "invalid", error: "Bookmark row has no CFI hint." } });
  });

  it("returns not-found without throwing when CFI probing is unavailable", async () => {
    const result = await probeReaderImportBookmarkCfi({ cfiHint: "epubcfi(/6/2)", probeCfi: null });

    expect(result).toEqual({ status: "not-found", result: { ok: false, code: "unsupported", error: "CFI probe is unavailable." } });
  });

  it("maps thrown probe errors to not-found", async () => {
    const result = await probeReaderImportBookmarkCfi({
      cfiHint: "epubcfi(/6/2)",
      probeCfi: async () => {
        throw new Error("Probe exploded");
      },
    });

    expect(result).toEqual({ status: "not-found", result: { ok: false, code: "resolution-failed", error: "Probe exploded" } });
  });
});
