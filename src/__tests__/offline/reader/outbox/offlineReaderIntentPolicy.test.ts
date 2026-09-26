import { describe, expect, it } from "vitest";
import type {
  DeleteReaderAnnotationIntent,
  EstablishReaderSessionIntent,
  ReaderOutboxIntent,
  ReplaceReaderProgressIntent,
  UpsertReaderAnnotationIntent,
} from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";
import {
  classifyClosedSessionReaderIntent,
  coalesceReaderIntent,
  isReaderIntentTransferableAfterSessionClosed,
} from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";

const SCOPE = { namespaceKey: "server:one|profile:reader", bookId: "book-1" };
const LOCAL_ORIGIN = { kind: "local-unconfirmed" } as const;
const CONFIRMED_ORIGIN = { kind: "server-confirmed", serverSessionId: "session-1" } as const;

describe("offline Reader intent policy", () => {
  it("keeps only the latest progress without comparing CFI ordering", () => {
    const first = progress("epubcfi(/6/2)", 10, 1);
    const second = progress("epubcfi(/6/100)", 90, 2);
    const third = progress("epubcfi(/6/4)", 20, 3);

    const intents = coalesceReaderIntent(
      coalesceReaderIntent(coalesceReaderIntent([], first), second),
      third,
    );

    expect(intents).toEqual([third]);
  });

  it("collapses an unconfirmed annotation create and edit to the latest upsert", () => {
    const created = annotationUpsert("annotation-1", 1, "yellow", "created", LOCAL_ORIGIN);
    const edited = annotationUpsert("annotation-1", 2, "blue", "edited", LOCAL_ORIGIN);

    expect(coalesceReaderIntent([created], edited)).toEqual([edited]);
  });

  it("removes an unconfirmed annotation create followed by delete", () => {
    const created = annotationUpsert("annotation-1", 1, "yellow", "created", LOCAL_ORIGIN);
    const deleted = annotationDelete("annotation-1", 2, LOCAL_ORIGIN);

    expect(coalesceReaderIntent([created], deleted)).toEqual([]);
  });

  it("replaces a confirmed annotation edit with one delete", () => {
    const edited = annotationUpsert("annotation-1", 1, "blue", "edited", CONFIRMED_ORIGIN);
    const deleted = annotationDelete("annotation-1", 2, CONFIRMED_ORIGIN);

    expect(coalesceReaderIntent([edited], deleted)).toEqual([deleted]);
  });

  it("replaces a delete with the latest restored annotation state", () => {
    const deleted = annotationDelete("annotation-1", 1, CONFIRMED_ORIGIN);
    const restored = annotationUpsert("annotation-1", 2, "pink", "restored", CONFIRMED_ORIGIN);

    expect(coalesceReaderIntent([deleted], restored)).toEqual([restored]);
  });

  it("collapses repeated deletes to the latest revision", () => {
    const first = annotationDelete("annotation-1", 1, CONFIRMED_ORIGIN);
    const second = annotationDelete("annotation-1", 2, CONFIRMED_ORIGIN);

    expect(coalesceReaderIntent([first], second)).toEqual([second]);
  });

  it("does not retain a standalone delete for an unconfirmed local annotation", () => {
    expect(coalesceReaderIntent([], annotationDelete("annotation-1", 1, LOCAL_ORIGIN))).toEqual([]);
  });

  it("does not coalesce different annotation client IDs", () => {
    const first = annotationUpsert("annotation-1", 1, "yellow", "first", LOCAL_ORIGIN);
    const second = annotationUpsert("annotation-2", 1, "blue", "second", LOCAL_ORIGIN);

    expect(coalesceReaderIntent([first], second)).toEqual([first, second]);
  });

  it.each([
    { namespaceKey: "server:two|profile:reader", bookId: "book-1", serverSessionId: "session-1" },
    { namespaceKey: SCOPE.namespaceKey, bookId: "book-2", serverSessionId: "session-1" },
    { namespaceKey: SCOPE.namespaceKey, bookId: "book-1", serverSessionId: "session-2" },
  ])("does not coalesce progress across account, Book, or Session scope", (scope) => {
    const first = progress("epubcfi(/6/2)", 10, 1);
    const second = progress("epubcfi(/6/4)", 20, 2, scope);

    expect(coalesceReaderIntent([first], second)).toEqual([first, second]);
  });

  it("collapses repeated session establishment per account and Book", () => {
    const establish: EstablishReaderSessionIntent = { type: "establish-session", ...SCOPE };

    expect(coalesceReaderIntent([establish], { ...establish })).toEqual([establish]);
    expect(coalesceReaderIntent([establish], {
      ...establish,
      bookId: "book-2",
    })).toHaveLength(2);
  });

  it("transfers progress and annotation desired state after SESSION_CLOSED", () => {
    const transferable: ReaderOutboxIntent[] = [
      progress("epubcfi(/6/4)", 20, 1),
      annotationUpsert("annotation-1", 1, "yellow", "note", CONFIRMED_ORIGIN),
    ];

    for (const intent of transferable) {
      expect(classifyClosedSessionReaderIntent(intent)).toEqual({ action: "transfer" });
      expect(isReaderIntentTransferableAfterSessionClosed(intent)).toBe(true);
    }
  });

  it("drops a confirmed delete instead of transferring it to a continuation Session", () => {
    const deleted = annotationDelete("annotation-1", 1, CONFIRMED_ORIGIN);

    expect(classifyClosedSessionReaderIntent(deleted)).toEqual({
      action: "drop",
      reason: "confirmed-delete",
    });
    expect(isReaderIntentTransferableAfterSessionClosed(deleted)).toBe(false);
  });

  it("resolves session establishment through normal open", () => {
    const establish: EstablishReaderSessionIntent = { type: "establish-session", ...SCOPE };

    expect(classifyClosedSessionReaderIntent(establish)).toEqual({ action: "resolve-with-open" });
    expect(isReaderIntentTransferableAfterSessionClosed(establish)).toBe(false);
  });
});

function progress(
  cfi: string,
  percentage: number,
  intentRevision: number,
  scope: typeof SCOPE & { serverSessionId: string } = { ...SCOPE, serverSessionId: "session-1" },
): ReplaceReaderProgressIntent {
  return {
    type: "replace-progress",
    ...scope,
    intentRevision,
    progress: { location: cfi, percentage, locationLabel: `${percentage.toString().padStart(3, "0")}% - Location` },
  };
}

function annotationUpsert(
  clientId: string,
  intentRevision: number,
  color: "yellow" | "blue" | "pink",
  note: string,
  origin: UpsertReaderAnnotationIntent["origin"],
): UpsertReaderAnnotationIntent {
  return {
    type: "upsert-annotation",
    ...SCOPE,
    serverSessionId: "session-1",
    intentRevision,
    origin,
    annotation: {
      clientId,
      kind: "highlight",
      location: { location: "epubcfi(/6/2)", locationLabel: "010% - Chapter 1" },
      body: { text: "Quote", prefix: "Before", suffix: "After", color, note },
    },
  };
}

function annotationDelete(
  clientId: string,
  intentRevision: number,
  origin: DeleteReaderAnnotationIntent["origin"],
): DeleteReaderAnnotationIntent {
  return {
    type: "delete-annotation",
    ...SCOPE,
    serverSessionId: "session-1",
    intentRevision,
    origin,
    clientId,
  };
}
