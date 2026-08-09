import { describe, expect, it, vi } from "vitest";
import { resolveReaderReflowCfi } from "../features/reader/engine/ReaderReflowTarget.Engine";
import { ReaderBootstrapProgressGuard } from "../features/reader/shell/ReaderBootstrapProgressGuard.State";

describe("reader bootstrap restore preservation", () => {
  it("uses an explicit restore CFI without consulting the current rendition location", () => {
    const getCurrentCfi = vi.fn(() => "epubcfi(/6/38)");

    expect(resolveReaderReflowCfi("epubcfi(/6/76)", getCurrentCfi)).toBe("epubcfi(/6/76)");
    expect(getCurrentCfi).not.toHaveBeenCalled();
  });

  it("uses the current rendition location when no restore CFI is protected", () => {
    const getCurrentCfi = vi.fn(() => "epubcfi(/6/38)");

    expect(resolveReaderReflowCfi(null, getCurrentCfi)).toBe("epubcfi(/6/38)");
    expect(getCurrentCfi).toHaveBeenCalledOnce();
  });

  it("keeps the restore CFI protected through layout activity until explicit navigation", () => {
    const guard = new ReaderBootstrapProgressGuard();
    guard.reset(7, "epubcfi(/6/76)");

    expect(guard.getProtectedRestoreCfi(7)).toBe("epubcfi(/6/76)");
    expect(guard.shouldPublishRelocation(7, "epubcfi(/6/38)")).toBe(false);
    expect(guard.getProtectedRestoreCfi(7)).toBe("epubcfi(/6/76)");

    guard.recordExplicitNavigation(7);

    expect(guard.getProtectedRestoreCfi(7)).toBeNull();
    expect(guard.shouldPublishRelocation(7, "epubcfi(/6/100)")).toBe(true);
  });

  it("does not invent restore preservation without an initial saved CFI or for a stale generation", () => {
    const guard = new ReaderBootstrapProgressGuard();
    guard.reset(8, null);

    expect(guard.getProtectedRestoreCfi(8)).toBeNull();
    guard.reset(9, "epubcfi(/6/90)");
    expect(guard.getProtectedRestoreCfi(8)).toBeNull();
    expect(guard.getProtectedRestoreCfi(9)).toBe("epubcfi(/6/90)");
  });
});
