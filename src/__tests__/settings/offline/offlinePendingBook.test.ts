import { describe, expect, it } from "vitest";
import { buildOfflinePendingWorkPresentation } from "../../../app/settings/offline/OfflinePendingWork.Presenter";
import type { OfflinePublicationAssetCompleteRecord } from "../../../app/offline/storage/OfflineRepositories.Types";
import { buildOfflineSavedPublications } from "../../../app/offline/publication/OfflineSavedPublication.Queries";
import type { ReaderOutboxIntent } from "../../../app/offline/reader/outbox/ReaderOutbox.Policy";

describe("offline pending Book presentation", () => {
  it("collapses resources into semantic, deterministically ordered Book rows", () => {
    const { summary, books } = buildOfflinePendingWorkPresentation({
      intents: [progress("book-z"), establish("book-a"), upsert("book-a"), removeAnnotation("book-a")],
      titles: new Map([["book-z", "A Known Title"], ["book-a", null]]),
      savedPublications: [publication("book-a")],
      now: 2_000,
    });

    expect(summary).toEqual({
      books: 2,
      intents: 4,
      sessionEstablishment: 1,
      progress: 1,
      annotations: 2,
      attentionBooks: 0,
      deferredBooks: 0,
    });
    expect(books.every((book) => book.status === "waiting")).toBe(true);
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

    const { books } = buildOfflinePendingWorkPresentation({
      intents: [terminal, deferred], titles: new Map(), savedPublications: [], now: 2_000,
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

  it("uses one explicit clock snapshot at deferred, exact, and overdue retry boundaries", () => {
    const future = withAttempt(progress("book-future"), "retry-later", 3_001);
    const exact = withAttempt(progress("book-exact"), "retry-later", 3_000);
    const overdue = withAttempt(progress("book-overdue"), "retry-later", 2_999);

    const presentation = buildOfflinePendingWorkPresentation({
      intents: [future, exact, overdue],
      titles: new Map(),
      savedPublications: [],
      now: 3_000,
    });

    expect(presentation.summary).toMatchObject({ books: 3, deferredBooks: 1, attentionBooks: 0 });
    expect(presentation.books.find((book) => book.bookId === "book-future")).toMatchObject({
      status: "deferred",
      progressStatus: "deferred",
    });
    expect(presentation.books.find((book) => book.bookId === "book-exact")).toMatchObject({
      status: "waiting",
      progressStatus: "waiting",
    });
    expect(presentation.books.find((book) => book.bookId === "book-overdue")).toMatchObject({
      status: "waiting",
      progressStatus: "waiting",
    });
  });

  it("presents an all-deferred Book consistently across summary, row, and categories", () => {
    const presentation = buildOfflinePendingWorkPresentation({
      intents: [
        withAttempt(progress("book-deferred"), "retry-later", 4_000),
        withAttempt(upsert("book-deferred"), "retry-later", 4_000),
      ],
      titles: new Map(),
      savedPublications: [],
      now: 3_000,
    });

    expect(presentation.summary).toMatchObject({ books: 1, intents: 2, deferredBooks: 1, attentionBooks: 0 });
    expect(presentation.books[0]).toMatchObject({
      status: "deferred",
      progressStatus: "deferred",
      annotationStatus: "deferred",
      deferredIntentCount: 2,
    });
  });

  it("keeps mixed-intent summary membership distinct from Book-row precedence", () => {
    const eligibleProgress = progress("book-mixed-deferred");
    const deferredAnnotation = withAttempt(upsert("book-mixed-deferred"), "retry-later", 4_000);
    const eligibleProgressWithAttention = progress("book-mixed-attention");
    const manualAnnotation = withAttempt(upsert("book-mixed-attention"), "terminal-request", null);

    const presentation = buildOfflinePendingWorkPresentation({
      intents: [eligibleProgress, deferredAnnotation, eligibleProgressWithAttention, manualAnnotation],
      titles: new Map(),
      savedPublications: [],
      now: 3_000,
    });

    expect(presentation.summary).toMatchObject({ books: 2, intents: 4, deferredBooks: 1, attentionBooks: 1 });
    expect(presentation.books.find((book) => book.bookId === "book-mixed-deferred")).toMatchObject({
      status: "deferred",
      progressStatus: "waiting",
      annotationStatus: "deferred",
      deferredIntentCount: 1,
    });
    expect(presentation.books.find((book) => book.bookId === "book-mixed-attention")).toMatchObject({
      status: "needs-attention",
      progressStatus: "waiting",
      annotationStatus: "needs-attention",
      attentionIntentCount: 1,
    });
  });

  it("preserves connection-repair and authority-blocked row precedence", () => {
    const auth = withAttempt(progress("book-auth"), "reauthenticate", null);
    const authority = withAttempt(upsert("book-authority"), "refresh-authority", null);
    const authWithManual = withAttempt(upsert("book-auth"), "terminal-request", null);
    const authDeferred = withAttempt(removeAnnotation("book-auth"), "retry-later", 4_000);
    const authorityDeferred = withAttempt(progress("book-authority"), "retry-later", 4_000);

    const presentation = buildOfflinePendingWorkPresentation({
      intents: [auth, authority, authWithManual, authDeferred, authorityDeferred],
      titles: new Map(),
      savedPublications: [],
      now: 3_000,
    });

    expect(presentation.summary).toMatchObject({ attentionBooks: 1, deferredBooks: 1 });
    expect(presentation.books.find((book) => book.bookId === "book-auth")).toMatchObject({
      status: "connection-repair",
      progressStatus: "connection-repair",
      annotationStatus: "needs-attention",
      deferredIntentCount: 1,
    });
    expect(presentation.books.find((book) => book.bookId === "book-authority")).toMatchObject({
      status: "authority-blocked",
      annotationStatus: "authority-blocked",
      progressStatus: "deferred",
    });
  });

  it("classifies establishment and downstream categories from the same Book snapshot", () => {
    const pendingProgress = withAttempt(progress("book-chain"), "retry-later", 4_000);
    const manualAnnotation = withAttempt(upsert("book-chain"), "failed", null);

    const presentation = buildOfflinePendingWorkPresentation({
      intents: [establish("book-chain"), pendingProgress, manualAnnotation],
      titles: new Map([["book-chain", "  Chain Book  "]]),
      savedPublications: [publication("book-chain")],
      now: 3_000,
    });

    expect(presentation.summary).toEqual({
      books: 1,
      intents: 3,
      sessionEstablishment: 1,
      progress: 1,
      annotations: 1,
      attentionBooks: 1,
      deferredBooks: 0,
    });
    expect(presentation.books[0]).toMatchObject({
      title: "Chain Book",
      status: "needs-attention",
      sessionStatus: "waiting",
      progressStatus: "deferred",
      annotationStatus: "needs-attention",
      hasOfflineAsset: true,
    });
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
    progress: { location: "epubcfi(/6/2)", percentage: 10, locationLabel: "010% - Chapter" },
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
    annotation: { clientId: "annotation-a", kind: "bookmark", location: { location: "epubcfi(/6/2)" } },
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

function publication(bookId: string) {
  return buildOfflineSavedPublications({ assets: [asset(bookId)], metadata: new Map() })[0];
}

function withAttempt<T extends ReaderOutboxIntent>(
  intent: T,
  classification: NonNullable<T["attempt"]>["classification"],
  retryEligibleAt: number | null,
): T {
  return {
    ...intent,
    attempt: {
      revision: "intentRevision" in intent ? intent.intentRevision : null,
      classification,
      attemptCount: 1,
      attemptedAt: 1_000,
      retryEligibleAt,
    },
  };
}
