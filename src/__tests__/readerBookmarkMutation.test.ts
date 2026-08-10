import { describe, expect, it, vi } from "vitest";
import type { MarginaliaAnnotation, SecondPassClient } from "@secondpass/client";
import {
  canMutateReaderBookmark,
  executeReaderBookmarkMutation,
} from "../features/reader/session/annotations/CurrentSessionBookmark.Actions";
import { shouldAcceptImportedBookmarkMutation } from "../features/reader/ReadingActivity";

const existingBookmark: MarginaliaAnnotation = {
  id: "bookmark-1",
  clientId: "bookmark-client-1",
  kind: "bookmark",
  location: { cfi: "epubcfi(/6/2)", locationLabel: "Chapter 01" },
  createdAt: "created",
  updatedAt: "updated",
};

function clientWithBatch(batchAnnotations: ReturnType<typeof vi.fn>): SecondPassClient {
  return {
    marginalia: { sessions: { batchAnnotations } },
  } as unknown as SecondPassClient;
}

describe("reader bookmark mutations", () => {
  it("reports not-allowed and missing-state without calling the server", async () => {
    const batchAnnotations = vi.fn();
    const spl = clientWithBatch(batchAnnotations);
    const common = {
      spl,
      sessionId: "session-1",
      location: { cfi: "epubcfi(/6/2)" },
      currentBookmark: null,
      annotationsRaw: [],
    };

    await expect(executeReaderBookmarkMutation({ ...common, canMutate: false })).resolves.toEqual({
      result: { ok: false, reason: "not-allowed" },
    });
    await expect(executeReaderBookmarkMutation({ ...common, sessionId: null })).resolves.toEqual({
      result: { ok: false, reason: "missing-state" },
    });
    expect(batchAnnotations).not.toHaveBeenCalled();
  });

  it("reports a confirmed bookmark creation", async () => {
    const batchAnnotations = vi.fn().mockResolvedValue({ annotations: [existingBookmark] });
    const result = await executeReaderBookmarkMutation({
      spl: clientWithBatch(batchAnnotations),
      sessionId: "session-1",
      location: { cfi: "epubcfi(/6/2)" },
      locationLabel: "Chapter 01",
      currentBookmark: null,
      annotationsRaw: [],
      canMutate: true,
    });

    expect(result).toEqual({ result: { ok: true, action: "created" }, annotations: [existingBookmark] });
  });

  it("reports a confirmed bookmark deletion", async () => {
    const batchAnnotations = vi.fn().mockResolvedValue({ annotations: [] });
    const result = await executeReaderBookmarkMutation({
      spl: clientWithBatch(batchAnnotations),
      sessionId: "session-1",
      location: { cfi: "epubcfi(/6/2)" },
      currentBookmark: { kind: "bookmark", id: "bookmark-1", cfi: "epubcfi(/6/2)" },
      annotationsRaw: [existingBookmark],
      canMutate: true,
    });

    expect(result).toEqual({ result: { ok: true, action: "deleted" }, annotations: [] });
    expect(batchAnnotations.mock.calls[0]?.[1]).toEqual([
      { action: "delete", clientId: "bookmark-client-1" },
    ]);
  });

  it("returns mutation-failed when the server mutation rejects", async () => {
    const error = new Error("server failed");
    const result = await executeReaderBookmarkMutation({
      spl: clientWithBatch(vi.fn().mockRejectedValue(error)),
      sessionId: "session-1",
      location: { cfi: "epubcfi(/6/2)" },
      currentBookmark: null,
      annotationsRaw: [],
      canMutate: true,
    });

    expect(result).toEqual({ result: { ok: false, reason: "mutation-failed", error } });
  });

  it("does not confirm creation when the response omits the created bookmark", async () => {
    const result = await executeReaderBookmarkMutation({
      spl: clientWithBatch(vi.fn().mockResolvedValue({ annotations: [] })),
      sessionId: "session-1",
      location: { cfi: "epubcfi(/6/2)" },
      currentBookmark: null,
      annotationsRaw: [],
      canMutate: true,
    });

    expect(result.result).toMatchObject({ ok: false, reason: "mutation-failed" });
  });

  it("accepts an imported bookmark only after confirmed creation", () => {
    expect(shouldAcceptImportedBookmarkMutation({ ok: true, action: "created" })).toBe(true);
    expect(shouldAcceptImportedBookmarkMutation({ ok: true, action: "deleted" })).toBe(false);
    expect(shouldAcceptImportedBookmarkMutation({ ok: false, reason: "mutation-failed" })).toBe(false);
    expect(shouldAcceptImportedBookmarkMutation({ ok: false, reason: "missing-state" })).toBe(false);
    expect(shouldAcceptImportedBookmarkMutation({ ok: false, reason: "not-allowed" })).toBe(false);
  });

  it("allows the bookmark control only for mutable sessions with a known CFI", () => {
    expect(canMutateReaderBookmark({ canMutateSession: true, sessionId: "session-1", cfi: "epubcfi(/6/2)" })).toBe(true);
    expect(canMutateReaderBookmark({ canMutateSession: false, sessionId: "session-1", cfi: "epubcfi(/6/2)" })).toBe(false);
    expect(canMutateReaderBookmark({ canMutateSession: true, sessionId: null, cfi: "epubcfi(/6/2)" })).toBe(false);
    expect(canMutateReaderBookmark({ canMutateSession: true, sessionId: "session-1", cfi: " " })).toBe(false);
  });
});
