import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type {
  OfflinePublicationAssetCompleteRecord,
  OfflineProjectionRecord,
  OfflinePublicationCoverRecord,
  OfflineReaderBookState,
} from "../../../app/offline/storage/OfflineRepositories.Types";
import {
  readerIntentResourceKey,
  type DeleteReaderAnnotationIntent,
  type ReaderOutboxIntent,
  type ReplaceReaderProgressIntent,
  type UpsertReaderAnnotationIntent,
} from "../../../app/offline/reader/outbox/ReaderOutbox.Policy";
import {
  createInMemoryOfflineRepositoryFactories,
  type OfflineRepositoryTestFactories,
} from "./OfflineRepositoryTest.Fixtures";
import { openIndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";

defineOfflineRepositoryContractTests(
  "in-memory offline repositories",
  createInMemoryOfflineRepositoryFactories(),
);

let indexedDbRepositorySequence = 0;
defineOfflineRepositoryContractTests("IndexedDB offline repositories", {
  createProjectionRepository: async () => (
    await createIndexedDbRepositories()
  ).projections,
  createPublicationAssetRepository: async () => (
    await createIndexedDbRepositories()
  ).publicationAssets,
  createPublicationCoverRepository: async () => (
    await createIndexedDbRepositories()
  ).publicationCovers,
  createReaderStateRepository: async () => (
    await createIndexedDbRepositories()
  ).readerState,
  createReaderOutboxRepository: async () => (
    await createIndexedDbRepositories()
  ).readerOutbox,
});

function createIndexedDbRepositories() {
  indexedDbRepositorySequence += 1;
  return openIndexedDbOfflineRepositories<Uint8Array>({
    indexedDb: new IDBFactory(),
    databaseName: `offline-conformance-${indexedDbRepositorySequence}`,
  });
}

function defineOfflineRepositoryContractTests(
  implementationName: string,
  factories: OfflineRepositoryTestFactories,
): void {
  describe(`${implementationName}: projection repository`, () => {
    it("round-trips successful projections without exposing stored object identity", async () => {
      const repository = await factories.createProjectionRepository();
      const record = projectionRecord("account-a", "recent", { count: 1 });

      await repository.put(record);
      record.value.count = 2;
      const first = await repository.get<{ count: number }>("account-a", "recent");
      first!.value.count = 3;

      expect(await repository.get("account-a", "recent")).toEqual(
        projectionRecord("account-a", "recent", { count: 1 }),
      );
    });

    it("replaces the same projection key within a namespace", async () => {
      const repository = await factories.createProjectionRepository();
      await repository.put(projectionRecord("account-a", "recent", { count: 1 }));
      const replacement = projectionRecord("account-a", "recent", { count: 2 });

      await repository.put(replacement);

      expect(await repository.get("account-a", "recent")).toEqual(replacement);
    });

    it("isolates equal projection keys across namespaces and targeted deletion", async () => {
      const repository = await factories.createProjectionRepository();
      const first = projectionRecord("account-a", "recent", { count: 1 });
      const second = projectionRecord("account-b", "recent", { count: 2 });
      await repository.put(first);
      await repository.put(second);

      await repository.delete("account-a", "recent");

      expect(await repository.get("account-a", "recent")).toBeNull();
      expect(await repository.get("account-b", "recent")).toEqual(second);
    });

    it("purges only the requested projection namespace", async () => {
      const repository = await factories.createProjectionRepository();
      await repository.put(projectionRecord("account-a", "recent", { count: 1 }));
      await repository.put(projectionRecord("account-a", "home", { count: 2 }));
      const retained = projectionRecord("account-b", "recent", { count: 3 });
      await repository.put(retained);

      await repository.deleteNamespace("account-a");

      expect(await repository.get("account-a", "recent")).toBeNull();
      expect(await repository.get("account-a", "home")).toBeNull();
      expect(await repository.get("account-b", "recent")).toEqual(retained);
    });
  });

  describe(`${implementationName}: publication asset repository`, () => {
    it("round-trips a complete asset without exposing stored bytes", async () => {
      const repository = await factories.createPublicationAssetRepository();
      const record = assetRecord("account-a", "book-1", "epub", "a", new Uint8Array([1, 2, 3]));

      await repository.putComplete(record);
      record.payload[0] = 9;
      const first = await repository.get("account-a", "book-1", "epub");
      first!.payload[1] = 9;

      expect(await repository.get("account-a", "book-1", "epub")).toEqual(
        assetRecord("account-a", "book-1", "epub", "a", new Uint8Array([1, 2, 3])),
      );
    });

    it("isolates Book IDs by namespace and replaces a changed checksum", async () => {
      const repository = await factories.createPublicationAssetRepository();
      const first = assetRecord("account-a", "book-1", "epub", "a", new Uint8Array([1]));
      const replacement = assetRecord("account-a", "book-1", "epub", "b", new Uint8Array([2]));
      const otherAccount = assetRecord("account-b", "book-1", "epub", "c", new Uint8Array([3]));
      await repository.putComplete(first);
      await repository.putComplete(otherAccount);

      await repository.putComplete(replacement);

      expect(await repository.get("account-a", "book-1", "epub")).toEqual(replacement);
      expect(await repository.get("account-b", "book-1", "epub")).toEqual(otherAccount);
    });

    it("isolates formats for the same account and Book", async () => {
      const repository = await factories.createPublicationAssetRepository();
      const epub = assetRecord("account-a", "book-1", "epub", "a", new Uint8Array([1]));
      const alternateFormat = assetRecord("account-a", "book-1", "cbz", "b", new Uint8Array([2]));
      await repository.putComplete(epub);
      await repository.putComplete(alternateFormat);

      await repository.delete("account-a", "book-1", "epub");

      expect(await repository.get("account-a", "book-1", "epub")).toBeNull();
      expect(await repository.get("account-a", "book-1", "cbz")).toEqual(alternateFormat);
    });

    it("lists only publication assets in the requested namespace", async () => {
      const repository = await factories.createPublicationAssetRepository();
      const first = assetRecord("account-a", "book-1", "epub", "a", new Uint8Array([1]));
      const second = assetRecord("account-a", "book-2", "epub", "b", new Uint8Array([2]));
      const otherAccount = assetRecord("account-b", "book-1", "epub", "c", new Uint8Array([3]));
      await repository.putComplete(first);
      await repository.putComplete(second);
      await repository.putComplete(otherAccount);

      const listed = await repository.list("account-a");
      listed[0].payload[0] = 9;

      expect(listed.map((record) => record.bookId).sort()).toEqual(["book-1", "book-2"]);
      expect((await repository.list("account-a")).map((record) => record.payload[0]).sort()).toEqual([1, 2]);
    });

    it("isolates targeted asset deletion and namespace purge", async () => {
      const repository = await factories.createPublicationAssetRepository();
      const retainedBook = assetRecord("account-a", "book-2", "epub", "b", new Uint8Array([2]));
      const retainedAccount = assetRecord("account-b", "book-1", "epub", "c", new Uint8Array([3]));
      await repository.putComplete(assetRecord("account-a", "book-1", "epub", "a", new Uint8Array([1])));
      await repository.putComplete(retainedBook);
      await repository.putComplete(retainedAccount);

      await repository.delete("account-a", "book-1", "epub");
      expect(await repository.get("account-a", "book-1", "epub")).toBeNull();
      expect(await repository.get("account-a", "book-2", "epub")).toEqual(retainedBook);

      await repository.deleteNamespace("account-a");
      expect(await repository.get("account-a", "book-2", "epub")).toBeNull();
      expect(await repository.get("account-b", "book-1", "epub")).toEqual(retainedAccount);
    });
  });

  describe(`${implementationName}: publication cover repository`, () => {
    it("round-trips and replaces one Book cover within its namespace", async () => {
      const repository = await factories.createPublicationCoverRepository();
      await repository.put(coverRecord("account-a", "book-1", "one", new Uint8Array([1])));
      const replacement = coverRecord("account-a", "book-1", "two", new Uint8Array([2]));

      await repository.put(replacement);

      expect(await repository.get("account-a", "book-1")).toEqual(replacement);
    });

    it("isolates targeted and namespace cover deletion", async () => {
      const repository = await factories.createPublicationCoverRepository();
      const retainedBook = coverRecord("account-a", "book-2", "two", new Uint8Array([2]));
      const retainedAccount = coverRecord("account-b", "book-1", "three", new Uint8Array([3]));
      await repository.put(coverRecord("account-a", "book-1", "one", new Uint8Array([1])));
      await repository.put(retainedBook);
      await repository.put(retainedAccount);

      await repository.delete("account-a", "book-1");
      expect(await repository.get("account-a", "book-1")).toBeNull();
      expect(await repository.get("account-a", "book-2")).toEqual(retainedBook);
      await repository.deleteNamespace("account-a");
      expect(await repository.get("account-a", "book-2")).toBeNull();
      expect(await repository.get("account-b", "book-1")).toEqual(retainedAccount);
    });
  });

  describe(`${implementationName}: Reader state repository`, () => {
    it("round-trips local Reader continuity without exposing stored state", async () => {
      const repository = await factories.createReaderStateRepository();
      const state = readerState("account-a", "book-1", "epubcfi(/6/2)");

      await repository.putBookState(state);
      state.progress!.location = "changed-before-read";
      const first = await repository.getBookState("account-a", "book-1");
      first!.progress!.location = "changed-after-read";

      expect(await repository.getBookState("account-a", "book-1")).toEqual(
        readerState("account-a", "book-1", "epubcfi(/6/2)"),
      );
    });

    it("isolates Books by account and replaces the latest local state", async () => {
      const repository = await factories.createReaderStateRepository();
      const replacement = readerState("account-a", "book-1", "epubcfi(/6/8)");
      const otherAccount = readerState("account-b", "book-1", "epubcfi(/6/4)");
      await repository.putBookState(readerState("account-a", "book-1", "epubcfi(/6/2)"));
      await repository.putBookState(otherAccount);

      await repository.putBookState(replacement);

      expect(await repository.getBookState("account-a", "book-1")).toEqual(replacement);
      expect(await repository.getBookState("account-b", "book-1")).toEqual(otherAccount);
    });

    it("updates an existing Reader record without exposing stored state", async () => {
      const repository = await factories.createReaderStateRepository();
      await repository.putBookState(readerState("account-a", "book-1", "epubcfi(/6/2)"));

      const result = await repository.updateBookState("account-a", "book-1", (current) => ({
        ...current,
        progress: { ...current.progress!, location: "epubcfi(/6/8)" },
      }));
      expect(result.status).toBe("committed");
      if (result.status !== "committed") throw new Error("Reader state update failed");
      result.state.progress!.location = "changed-after-update";

      expect((await repository.getBookState("account-a", "book-1"))?.progress?.location)
        .toBe("epubcfi(/6/8)");
    });

    it("reports missing instead of creating Reader state during an update", async () => {
      const repository = await factories.createReaderStateRepository();

      await expect(repository.updateBookState("account-a", "book-1", (current) => current))
        .resolves.toEqual({ status: "missing" });
      expect(await repository.getBookState("account-a", "book-1")).toBeNull();
    });

    it("isolates targeted Reader-state deletion and namespace purge", async () => {
      const repository = await factories.createReaderStateRepository();
      const retainedBook = readerState("account-a", "book-2", "epubcfi(/6/4)");
      const retainedAccount = readerState("account-b", "book-1", "epubcfi(/6/6)");
      await repository.putBookState(readerState("account-a", "book-1", "epubcfi(/6/2)"));
      await repository.putBookState(retainedBook);
      await repository.putBookState(retainedAccount);

      await repository.deleteBookState("account-a", "book-1");
      expect(await repository.getBookState("account-a", "book-1")).toBeNull();
      expect(await repository.getBookState("account-a", "book-2")).toEqual(retainedBook);

      await repository.deleteNamespace("account-a");
      expect(await repository.getBookState("account-a", "book-2")).toBeNull();
      expect(await repository.getBookState("account-b", "book-1")).toEqual(retainedAccount);
    });
  });

  describe(`${implementationName}: Reader outbox repository`, () => {
    it("atomically coalesces progress to the latest desired state", async () => {
      const repository = await factories.createReaderOutboxRepository();
      const latest = progressIntent("account-a", "book-1", "session-1", 3, "epubcfi(/6/4)");
      await repository.upsertIntent(progressIntent("account-a", "book-1", "session-1", 1, "epubcfi(/6/2)"));
      await repository.upsertIntent(progressIntent("account-a", "book-1", "session-1", 2, "epubcfi(/6/100)"));

      await repository.upsertIntent(latest);

      expect(await repository.list("account-a")).toEqual([latest]);
    });

    it("coalesces annotation create, edit, and unconfirmed delete", async () => {
      const repository = await factories.createReaderOutboxRepository();
      const edited = annotationUpsert("account-a", "book-1", "session-1", "annotation-1", 2, "edited", "local-unconfirmed");
      await repository.upsertIntent(annotationUpsert("account-a", "book-1", "session-1", "annotation-1", 1, "created", "local-unconfirmed"));
      await repository.upsertIntent(edited);
      expect(await repository.list("account-a")).toEqual([edited]);

      await repository.upsertIntent(annotationDelete("account-a", "book-1", "session-1", "annotation-1", 3, "local-unconfirmed"));

      expect(await repository.list("account-a")).toEqual([]);
    });

    it("coalesces confirmed edit-delete and delete-restore transitions", async () => {
      const repository = await factories.createReaderOutboxRepository();
      const deleted = annotationDelete("account-a", "book-1", "session-1", "annotation-1", 2, "server-confirmed");
      await repository.upsertIntent(annotationUpsert("account-a", "book-1", "session-1", "annotation-1", 1, "edited", "server-confirmed"));

      await repository.upsertIntent(deleted);
      expect(await repository.list("account-a")).toEqual([deleted]);

      const restored = annotationUpsert("account-a", "book-1", "session-1", "annotation-1", 3, "restored", "server-confirmed");
      await repository.upsertIntent(restored);
      expect(await repository.list("account-a")).toEqual([restored]);
    });

    it("keeps repeated deletes as one latest intent", async () => {
      const repository = await factories.createReaderOutboxRepository();
      await repository.upsertIntent(annotationDelete("account-a", "book-1", "session-1", "annotation-1", 1, "server-confirmed"));
      const latest = annotationDelete("account-a", "book-1", "session-1", "annotation-1", 2, "server-confirmed");

      await repository.upsertIntent(latest);

      expect(await repository.list("account-a")).toEqual([latest]);
    });

    it("keeps different account, Book, Session, and annotation resources separate", async () => {
      const repository = await factories.createReaderOutboxRepository();
      const intents: ReaderOutboxIntent[] = [
        annotationUpsert("account-a", "book-1", "session-1", "annotation-1", 1, "one", "local-unconfirmed"),
        annotationUpsert("account-a", "book-1", "session-1", "annotation-2", 1, "two", "local-unconfirmed"),
        annotationUpsert("account-a", "book-1", "session-2", "annotation-1", 1, "three", "local-unconfirmed"),
        annotationUpsert("account-a", "book-2", "session-1", "annotation-1", 1, "four", "local-unconfirmed"),
        annotationUpsert("account-b", "book-1", "session-1", "annotation-1", 1, "five", "local-unconfirmed"),
      ];
      for (const intent of intents) await repository.upsertIntent(intent);

      expect(resourceKeys(await repository.list("account-a"))).toEqual(resourceKeys(intents.slice(0, 4)));
      expect(await repository.list("account-b")).toEqual([intents[4]]);
    });

    it("does not let a stale acknowledgement remove a newer revision", async () => {
      const repository = await factories.createReaderOutboxRepository();
      const current = progressIntent("account-a", "book-1", "session-1", 2, "epubcfi(/6/4)");
      await repository.upsertIntent(progressIntent("account-a", "book-1", "session-1", 1, "epubcfi(/6/2)"));
      await repository.upsertIntent(current);
      const key = readerIntentResourceKey(current);

      expect(await repository.remove("account-b", key, 2)).toBe(false);
      expect(await repository.remove("account-a", key, 1)).toBe(false);
      expect(await repository.list("account-a")).toEqual([current]);
      expect(await repository.remove("account-a", key, 2)).toBe(true);
      expect(await repository.list("account-a")).toEqual([]);
    });

    it("records failure only for an exact revision and clears it on a newer desired state", async () => {
      const repository = await factories.createReaderOutboxRepository();
      const first = progressIntent("account-a", "book-1", "session-1", 1, "epubcfi(/6/2)");
      await repository.upsertIntent(first);
      const key = readerIntentResourceKey(first);
      const attempt = {
        revision: 1,
        classification: "terminal-request" as const,
        attemptCount: 1,
        attemptedAt: 1_000,
        retryEligibleAt: null,
      };

      expect(await repository.recordAttempt("account-a", key, 2, attempt)).toBe(false);
      expect(await repository.recordAttempt("account-a", key, 1, { ...attempt, revision: 2 })).toBe(false);
      expect(await repository.recordAttempt("account-a", key, 1, attempt)).toBe(true);
      expect((await repository.list("account-a"))[0].attempt).toEqual(attempt);

      const newer = progressIntent("account-a", "book-1", "session-1", 2, "epubcfi(/6/4)");
      await repository.upsertIntent(newer);
      expect(await repository.list("account-a")).toEqual([newer]);
      expect(await repository.recordAttempt("account-a", key, 1, attempt)).toBe(false);
    });

    it("atomically replaces only an exact current revision under a new resource identity", async () => {
      const repository = await factories.createReaderOutboxRepository();
      const current = annotationUpsert("account-a", "book-1", "session-1", "annotation-1", 2, "edited", "server-confirmed");
      const replacement = annotationUpsert("account-a", "book-1", "session-2", "annotation-2", 3, "edited", "local-unconfirmed");
      await repository.upsertIntent(current);
      const key = readerIntentResourceKey(current);

      expect(await repository.replace("account-a", key, 1, replacement)).toBe(false);
      expect(await repository.list("account-a")).toEqual([current]);
      expect(await repository.replace("account-a", key, 2, replacement)).toBe(true);
      expect(await repository.list("account-a")).toEqual([replacement]);
    });

    it("returns detached intents and purges only the requested namespace", async () => {
      const repository = await factories.createReaderOutboxRepository();
      const first = progressIntent("account-a", "book-1", "session-1", 1, "epubcfi(/6/2)");
      const retained = progressIntent("account-b", "book-1", "session-1", 1, "epubcfi(/6/4)");
      await repository.upsertIntent(first);
      await repository.upsertIntent(retained);
      const listed = await repository.list("account-a");
      (listed[0] as ReplaceReaderProgressIntent).progress.location = "changed";

      expect(await repository.list("account-a")).toEqual([first]);
      await repository.deleteNamespace("account-a");
      expect(await repository.list("account-a")).toEqual([]);
      expect(await repository.list("account-b")).toEqual([retained]);
    });
  });
}

function projectionRecord<T>(namespaceKey: string, projectionKey: string, value: T): OfflineProjectionRecord<T> {
  return { namespaceKey, projectionKey, value, fetchedAt: 1_000, schemaVersion: 1 };
}

function assetRecord(
  namespaceKey: string,
  bookId: string,
  format: string,
  checksumCharacter: string,
  payload: Uint8Array,
): OfflinePublicationAssetCompleteRecord<Uint8Array> {
  return {
    status: "complete",
    namespaceKey,
    bookId,
    format,
    checksum: checksumCharacter.repeat(64),
    byteLength: payload.byteLength,
    schemaVersion: 1,
    payload,
  };
}

function coverRecord(
  namespaceKey: string,
  bookId: string,
  source: string,
  payload: Uint8Array,
): OfflinePublicationCoverRecord<Uint8Array> {
  return {
    namespaceKey,
    bookId,
    sourceUrl: `https://library.example/covers/${source}.jpg`,
    contentType: "image/jpeg",
    byteLength: payload.byteLength,
    schemaVersion: 1,
    payload,
  };
}

function readerState(namespaceKey: string, bookId: string, cfi: string): OfflineReaderBookState {
  return {
    annotationRevision: 0,
    namespaceKey,
    bookId,
    schemaVersion: 1,
    session: {
      kind: "server-confirmed",
      localSessionId: `local-${bookId}`,
      serverSessionId: "session-1",
      lastKnownServerStatus: "active",
    },
    progress: { location: cfi, percentage: 10, locationLabel: "010% - Location" },
    annotations: [],
  };
}

function progressIntent(
  namespaceKey: string,
  bookId: string,
  serverSessionId: string,
  intentRevision: number,
  cfi: string,
): ReplaceReaderProgressIntent {
  return {
    type: "replace-progress",
    namespaceKey,
    bookId,
    serverSessionId,
    intentRevision,
    progress: { location: cfi, percentage: 10, locationLabel: "010% - Location" },
  };
}

function annotationUpsert(
  namespaceKey: string,
  bookId: string,
  serverSessionId: string,
  clientId: string,
  intentRevision: number,
  note: string,
  originKind: "local-unconfirmed" | "server-confirmed",
): UpsertReaderAnnotationIntent {
  return {
    type: "upsert-annotation",
    namespaceKey,
    bookId,
    serverSessionId,
    intentRevision,
    origin: originKind === "server-confirmed"
      ? { kind: originKind, serverSessionId }
      : { kind: originKind },
    annotation: {
      clientId,
      kind: "highlight",
      location: { location: "epubcfi(/6/2)", locationLabel: "010% - Location" },
      body: { text: "Quote", color: "yellow", note },
    },
  };
}

function annotationDelete(
  namespaceKey: string,
  bookId: string,
  serverSessionId: string,
  clientId: string,
  intentRevision: number,
  originKind: "local-unconfirmed" | "server-confirmed",
): DeleteReaderAnnotationIntent {
  return {
    type: "delete-annotation",
    namespaceKey,
    bookId,
    serverSessionId,
    intentRevision,
    origin: originKind === "server-confirmed"
      ? { kind: originKind, serverSessionId }
      : { kind: originKind },
    clientId,
  };
}

function resourceKeys(intents: readonly ReaderOutboxIntent[]): string[] {
  return intents.map(readerIntentResourceKey).sort();
}
