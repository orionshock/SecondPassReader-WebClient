import { describe, expect, it } from "vitest";
import { presentOfflinePendingBooks } from "../app/settings/offline/OfflinePendingBook.State";
import type { OfflinePublicationAssetCompleteRecord } from "../app/offline/OfflineRepositories.Types";
import type { ReaderOutboxIntent } from "../app/offline/ReaderOutbox.Policy";

describe("offline pending Book presentation", () => {
  it("collapses resources into semantic, deterministically ordered Book rows", () => {
    const books = presentOfflinePendingBooks({
      intents: [progress("book-z"), establish("book-a"), upsert("book-a"), removeAnnotation("book-a")],
      titles: new Map([["book-z", "A Known Title"], ["book-a", null]]),
      assets: [asset("book-a")],
    });

    expect(books).toEqual([
      expect.objectContaining({
        bookId: "book-z",
        title: "A Known Title",
        pendingIntentCount: 1,
        hasProgress: true,
      }),
      expect.objectContaining({
        bookId: "book-a",
        title: "Book book-a",
        pendingIntentCount: 3,
        needsSessionEstablishment: true,
        annotationUpsertCount: 1,
        annotationDeleteCount: 1,
        hasOfflineAsset: true,
        assetFormats: ["EPUB"],
      }),
    ]);
  });

  it("presents durable terminal and deferred revisions without exposing internal classifications", () => {
    const terminal = upsert("book-terminal");
    terminal.attempt = {
      revision: 1, classification: "terminal-request", attemptCount: 1, attemptedAt: 1_000, retryEligibleAt: null,
    };
    const deferred = progress("book-deferred");
    deferred.attempt = {
      revision: 1, classification: "retry-later", attemptCount: 2, attemptedAt: 1_000, retryEligibleAt: 3_000,
    };

    const books = presentOfflinePendingBooks({
      intents: [terminal, deferred], titles: new Map(), assets: [], now: 2_000,
    });

    expect(books.find((book) => book.bookId === "book-terminal")).toMatchObject({
      status: "needs-attention", attentionIntentCount: 1,
    });
    expect(books.find((book) => book.bookId === "book-deferred")).toMatchObject({
      status: "deferred", deferredIntentCount: 1,
    });
    expect(JSON.stringify(books)).not.toContain("terminal-request");
    expect(JSON.stringify(books)).not.toContain("retry-later");
  });
});

function establish(bookId: string): ReaderOutboxIntent {
  return { type: "establish-session", namespaceKey: "account-a", bookId };
}

function progress(bookId: string): ReaderOutboxIntent {
  return {
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId,
    serverSessionId: null,
    intentRevision: 1,
    progress: { cfi: "epubcfi(/6/2)", percentage: 10, locationLabel: "010% - Chapter" },
  };
}

function upsert(bookId: string): ReaderOutboxIntent {
  return {
    type: "upsert-annotation",
    namespaceKey: "account-a",
    bookId,
    serverSessionId: null,
    intentRevision: 1,
    origin: { kind: "local-unconfirmed" },
    annotation: { clientId: "annotation-a", kind: "bookmark", location: { cfi: "epubcfi(/6/2)" } },
  };
}

function removeAnnotation(bookId: string): ReaderOutboxIntent {
  return {
    type: "delete-annotation",
    namespaceKey: "account-a",
    bookId,
    serverSessionId: "session-a",
    intentRevision: 2,
    origin: { kind: "server-confirmed", serverSessionId: "session-a" },
    clientId: "annotation-b",
  };
}

function asset(bookId: string): OfflinePublicationAssetCompleteRecord<Blob> {
  return {
    status: "complete",
    namespaceKey: "account-a",
    bookId,
    format: "epub",
    checksum: "a".repeat(64),
    byteLength: 4,
    schemaVersion: 1,
    payload: new Blob(["book"]),
  };
}
