import { afterEach, describe, expect, it, vi } from "vitest";
import { releaseOpenedBook, resolveReaderOpenCompletion } from "../features/reader/ReaderOpen.Lifecycle";
import type { OpenedBook } from "../features/reader/Reader.Types";

describe("reader open lifecycle", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("revokes the object URL when a completed reader open is stale", () => {
    const revokeObjectURL = stubObjectUrlRevocation();
    const opened = openedBook();

    expect(resolveReaderOpenCompletion(opened, false)).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(opened.objectUrl);
  });

  it("retains the object URL when the completed reader open is current", () => {
    const revokeObjectURL = stubObjectUrlRevocation();
    const opened = openedBook();

    expect(resolveReaderOpenCompletion(opened, true)).toBe(opened);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("revokes the active object URL when the reader is released", () => {
    const revokeObjectURL = stubObjectUrlRevocation();
    const opened = openedBook();

    releaseOpenedBook(opened);

    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(opened.objectUrl);
  });

  it("does not revoke when no reader open produced an object URL", () => {
    const revokeObjectURL = stubObjectUrlRevocation();

    releaseOpenedBook(null);

    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});

function stubObjectUrlRevocation() {
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { revokeObjectURL });
  return revokeObjectURL;
}

function openedBook(): OpenedBook {
  return {
    book: { id: "42", title: "Book" } as OpenedBook["book"],
    blob: new Blob(),
    objectUrl: "blob:reader-book",
    openedAt: "2026-08-09T00:00:00.000Z",
    returnTarget: { kind: "home", label: "Home", route: "#/home" },
  };
}
