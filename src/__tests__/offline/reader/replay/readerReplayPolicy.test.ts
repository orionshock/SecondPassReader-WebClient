import { describe, expect, it } from "vitest";
import {
  classifyClosedSessionReaderIntent,
  readerIntentResourceKey,
  type DeleteReaderAnnotationIntent,
  type EstablishReaderSessionIntent,
  type ReaderOutboxIntent,
  type ReplaceReaderProgressIntent,
  type UpsertReaderAnnotationIntent,
} from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";
import {
  canAcknowledgeReaderIntent,
  groupReaderIntentsForReplay,
  readerReplayPriority,
  sortReaderIntentsForReplay,
} from "../../../../app/offline/reader/replay/ReaderReplay.Policy";

describe("Reader replay policy", () => {
  it("orders Session establishment before annotations and progress", () => {
    const intents = [progress(), annotationUpsert("annotation-b", 2), establish(), annotationDelete("annotation-a", 1)];

    expect(sortReaderIntentsForReplay(intents).map((intent) => intent.type)).toEqual([
      "establish-session",
      "delete-annotation",
      "upsert-annotation",
      "replace-progress",
    ]);
    expect(readerReplayPriority(establish())).toBeLessThan(readerReplayPriority(annotationUpsert("annotation-a", 1)));
    expect(readerReplayPriority(progress())).toBeGreaterThan(readerReplayPriority(annotationUpsert("annotation-a", 1)));
  });

  it("uses stable resource identity instead of repository input order", () => {
    const intents: ReaderOutboxIntent[] = [
      annotationUpsert("annotation-b", 1),
      progress(),
      establish(),
      annotationDelete("annotation-a", 2),
    ];
    const forward = sortReaderIntentsForReplay(intents).map(readerIntentResourceKey);
    const reverse = sortReaderIntentsForReplay([...intents].reverse()).map(readerIntentResourceKey);

    expect(reverse).toEqual(forward);
  });

  it("groups different account and Book scopes independently", () => {
    const groups = groupReaderIntentsForReplay([
      progress({ namespaceKey: "account-b", bookId: "book-1" }),
      progress({ namespaceKey: "account-a", bookId: "book-2" }),
      annotationUpsert("annotation-a", 1),
      establish(),
    ]);

    expect(groups.map(({ namespaceKey, bookId, intents }) => ({
      namespaceKey,
      bookId,
      types: intents.map((intent) => intent.type),
    }))).toEqual([
      { namespaceKey: "account-a", bookId: "book-1", types: ["establish-session", "upsert-annotation"] },
      { namespaceKey: "account-a", bookId: "book-2", types: ["replace-progress"] },
      { namespaceKey: "account-b", bookId: "book-1", types: ["replace-progress"] },
    ]);
  });

  it("acknowledges only the exact current mutable revision", () => {
    expect(canAcknowledgeReaderIntent(progress({ intentRevision: 3 }), 3)).toBe(true);
    expect(canAcknowledgeReaderIntent(progress({ intentRevision: 3 }), 2)).toBe(false);
    expect(canAcknowledgeReaderIntent(establish(), null)).toBe(true);
  });

  it("keeps SESSION_CLOSED transfer and drop decisions from the intent policy", () => {
    expect(classifyClosedSessionReaderIntent(progress())).toEqual({ action: "transfer" });
    expect(classifyClosedSessionReaderIntent(annotationUpsert("annotation-a", 1))).toEqual({ action: "transfer" });
    expect(classifyClosedSessionReaderIntent(annotationDelete("annotation-a", 1))).toEqual({
      action: "drop",
      reason: "confirmed-delete",
    });
    expect(classifyClosedSessionReaderIntent(establish())).toEqual({ action: "resolve-with-open" });
  });

  it("rejects an unsupported start-over record instead of assigning replay priority", () => {
    const unsupported = { type: "start-over" } as unknown as ReaderOutboxIntent;

    expect(() => readerReplayPriority(unsupported)).toThrow(/unsupported reader replay intent/i);
  });

});

const SCOPE = {
  namespaceKey: "account-a",
  bookId: "book-1",
  serverSessionId: "session-1",
};

function establish(): EstablishReaderSessionIntent {
  return { type: "establish-session", namespaceKey: SCOPE.namespaceKey, bookId: SCOPE.bookId };
}

function progress(overrides: Partial<ReplaceReaderProgressIntent> = {}): ReplaceReaderProgressIntent {
  return {
    type: "replace-progress",
    ...SCOPE,
    intentRevision: 1,
    progress: { cfi: "epubcfi(/6/2)", percentage: 10, locationLabel: "010% - Location" },
    ...overrides,
  };
}

function annotationUpsert(clientId: string, intentRevision: number): UpsertReaderAnnotationIntent {
  return {
    type: "upsert-annotation",
    ...SCOPE,
    intentRevision,
    origin: { kind: "local-unconfirmed" },
    annotation: {
      clientId,
      kind: "bookmark",
      location: { cfi: "epubcfi(/6/2)", locationLabel: "010% - Location" },
    },
  };
}

function annotationDelete(clientId: string, intentRevision: number): DeleteReaderAnnotationIntent {
  return {
    type: "delete-annotation",
    ...SCOPE,
    intentRevision,
    origin: { kind: "server-confirmed", serverSessionId: SCOPE.serverSessionId },
    clientId,
  };
}
