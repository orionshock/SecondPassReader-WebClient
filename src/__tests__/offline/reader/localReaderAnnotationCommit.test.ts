import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { openIndexedDbOfflineRepositories } from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type { OfflineReaderBookState } from "../../../app/offline/storage/OfflineRepositories.Types";
import type { LocalReaderAnnotationCommit } from "../../../app/offline/reader/annotations/LocalReaderAnnotationCommit.Repository";
import { projectionMatchesIntent } from "../../../app/offline/reader/annotations/ReaderAnnotationDesiredState.Policy";
import { buildBookmarkUpsert, buildHighlightUpsert } from "../../../features/reader/session/ReadingSessionMarginalia.Actions";

describe("atomic local Reader annotation commit", () => {
  it.each(["create", "update", "confirmed-delete", "local-delete"] as const)(
    "rolls back %s when projection write succeeds but outbox write fails",
    async (operation) => {
      const { repositories, state } = await setup();
      let before = state;
      if (operation !== "create") {
        const created = await repositories.readerAnnotationCommit.commit(author(state));
        if (created.status !== "committed") throw new Error("setup failed");
        before = created.state;
      }
      if (operation === "confirmed-delete") {
        before.annotations[0].origin = { kind: "server-confirmed", serverSessionId: "session-1" };
        await repositories.readerState.putBookState(before);
      }
      const beforeIntents = await repositories.readerOutbox.list("account");
      const input = author(before, operation.endsWith("delete")
        ? { action: "delete", clientId: "annotation-1" } : highlight(operation));
      let projectionWritten = false;
      const put = IDBObjectStore.prototype.put;
      const putSpy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args) {
        if (this.name === "readerOutbox") {
          expect(projectionWritten).toBe(true);
          throw new Error("outbox storage failed");
        }
        const request = put.apply(this, args);
        if (this.name === "readerState") request.addEventListener("success", () => { projectionWritten = true; });
        return request;
      });
      const remove = IDBObjectStore.prototype.delete;
      const deleteSpy = vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(function (this: IDBObjectStore, ...args) {
        if (this.name === "readerOutbox") {
          expect(projectionWritten).toBe(true);
          throw new Error("outbox storage failed");
        }
        return remove.apply(this, args);
      });
      try {
        await expect(repositories.readerAnnotationCommit.commit(input)).rejects.toThrow("outbox storage failed");
        expect(projectionWritten).toBe(true);
      } finally {
        putSpy.mockRestore();
        deleteSpy.mockRestore();
      }
      expect(await repositories.readerState.getBookState("account", "book")).toEqual(before);
      expect(await repositories.readerOutbox.list("account")).toEqual(beforeIntents);
      repositories.close();
    },
  );

  it("advances projection and coalesced intent together and preserves a newer edit against a stale commit", async () => {
    const { repositories, state } = await setup();
    const first = await repositories.readerAnnotationCommit.commit(author(state));
    if (first.status !== "committed") throw new Error("setup failed");
    const stale = author(first.state, highlight("stale"));
    const updated = await repositories.readerAnnotationCommit.commit(author(first.state, highlight("newest")));
    expect(updated.status).toBe("committed");
    await expect(repositories.readerAnnotationCommit.commit(stale)).resolves.toEqual({ status: "conflict" });
    const stored = (await repositories.readerState.getBookState("account", "book"))!;
    const intents = await repositories.readerOutbox.list("account");
    expect(stored.annotationRevision).toBe(2);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ type: "upsert-annotation", intentRevision: 2, annotation: { body: { note: "newest" } } });
    if (intents[0].type !== "upsert-annotation") throw new Error("missing upsert");
    expect(projectionMatchesIntent(stored.annotations[0], intents[0])).toBe(true);
    repositories.close();
  });

  it("removes an unconfirmed create and its outbox without leaving a tombstone", async () => {
    const { repositories, state } = await setup();
    const created = await repositories.readerAnnotationCommit.commit(author(state));
    if (created.status !== "committed") throw new Error("setup failed");
    await repositories.readerAnnotationCommit.commit(author(created.state, { action: "delete", clientId: "annotation-1" }));
    expect((await repositories.readerState.getBookState("account", "book"))?.annotations).toEqual([]);
    expect(await repositories.readerOutbox.list("account")).toEqual([]);
    repositories.close();
  });

  it("commits a confirmed tombstone and delete intent, then permits an explicit restore against that tombstone", async () => {
    const { repositories, state } = await setup();
    state.annotations = [{ status: "present", origin: { kind: "server-confirmed", serverSessionId: "session-1" },
      annotation: { clientId: "annotation-1", kind: "bookmark", location: { location: "point", locationLabel: "" } } }];
    await repositories.readerState.putBookState(state);
    const deleted = await repositories.readerAnnotationCommit.commit(author(state, { action: "delete", clientId: "annotation-1" }));
    if (deleted.status !== "committed") throw new Error("delete failed");
    const [intent] = await repositories.readerOutbox.list("account");
    expect(intent).toMatchObject({ type: "delete-annotation", intentRevision: 1, origin: state.annotations[0].origin });
    if (intent.type !== "delete-annotation") throw new Error("missing delete");
    expect(projectionMatchesIntent(deleted.state.annotations[0], intent)).toBe(true);
    const restored = await repositories.readerAnnotationCommit.commit(author(deleted.state,
      buildBookmarkUpsert({ clientId: "annotation-1", cfi: "epubcfi(/6/4!/4/2/1:2)" })));
    expect(restored.status).toBe("committed");
    expect(await repositories.readerOutbox.list("account")).toEqual([
      expect.objectContaining({ type: "upsert-annotation", intentRevision: 2, origin: state.annotations[0].origin }),
    ]);
    repositories.close();
  });

  it("reopens a matching projection and intent after a successful commit whose completion was lost", async () => {
    const { repositories, state, options } = await setup();
    const input = author(state);
    const loseCompletion = async () => {
      await repositories.readerAnnotationCommit.commit(input);
      throw new Error("completion lost");
    };
    await expect(loseCompletion()).rejects.toThrow("completion lost");
    repositories.close();
    const reopened = await openIndexedDbOfflineRepositories(options);
    const before = await reopened.readerState.getBookState("account", "book");
    await expect(reopened.readerAnnotationCommit.commit(input)).resolves.toMatchObject({ status: "committed" });
    expect(await reopened.readerState.getBookState("account", "book")).toEqual(before);
    const intents = await reopened.readerOutbox.list("account");
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ intentRevision: 1, annotation: { clientId: "annotation-1" } });
    if (intents[0].type !== "upsert-annotation") throw new Error("missing upsert");
    expect(projectionMatchesIntent(before?.annotations[0], intents[0])).toBe(true);
    reopened.close();
  });

  it.each(["closed", "changed-authority", "previous-session", "missing-state"] as const)("rejects %s without creating delivery intent", async (condition) => {
    const { repositories, state } = await setup();
    const input = author(state);
    if (condition === "missing-state") await repositories.readerState.deleteBookState("account", "book");
    else {
      const next = structuredClone(state);
      if (condition === "closed") next.session.lastKnownServerStatus = "closed";
      if (condition === "changed-authority") next.session.localSessionId = "local:other";
      if (condition === "previous-session") next.annotations = [{ status: "present", origin: { kind: "server-confirmed", serverSessionId: "previous" },
        annotation: { clientId: "annotation-1", kind: "bookmark", location: { location: "point", locationLabel: "" } } }];
      await repositories.readerState.putBookState(next);
    }
    await expect(repositories.readerAnnotationCommit.commit(input)).resolves.toEqual({ status: condition === "missing-state" ? "no-local-state" : "not-writable" });
    expect(await repositories.readerOutbox.list("account")).toEqual([]);
    repositories.close();
  });
});

function highlight(note = "first") {
  return buildHighlightUpsert({ clientId: "annotation-1", cfi: "epubcfi(/6/4!/4/2,/1:2,/1:7)", text: "Text", color: "yellow", note });
}

function author(state: OfflineReaderBookState, mutation = highlight()): LocalReaderAnnotationCommit {
  return { kind: "author", namespaceKey: state.namespaceKey, bookId: state.bookId, authority: state.session,
    expectedRevision: state.annotationRevision, expectedProjection: state.annotations[0], mutation };
}

async function setup() {
  const options = { indexedDb: new IDBFactory(), databaseName: "atomic-annotation" };
  const repositories = await openIndexedDbOfflineRepositories(options);
  const state: OfflineReaderBookState = {
    annotationRevision: 0,
    namespaceKey: "account", bookId: "book", schemaVersion: 1,
    session: { kind: "server-confirmed", localSessionId: "local:reader", serverSessionId: "session-1", lastKnownServerStatus: "active" },
    progress: null, annotations: [],
  };
  await repositories.readerState.putBookState(state);
  return { options, repositories, state };
}
