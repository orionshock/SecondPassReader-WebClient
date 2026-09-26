import type { MarginaliaHighlightUpsert } from "@secondpass/client";
import { describe, expect, it } from "vitest";
import { applyAnnotationMutation, projectionMatchesIntent, sameAnnotation, sameProjection } from "../../../app/offline/reader/annotations/ReaderAnnotationDesiredState.Policy";
import type { OfflineReaderAnnotationProjection } from "../../../app/offline/storage/OfflineRepositories.Types";
import type { UpsertReaderAnnotationIntent } from "../../../app/offline/reader/outbox/ReaderOutbox.Policy";

const annotation: MarginaliaHighlightUpsert = {
  clientId: "highlight", kind: "highlight", location: { location: "range", locationLabel: "Chapter" },
  body: { text: "Quote", prefix: "Before", suffix: "After", color: "yellow", note: "Note" },
};
const origin = { kind: "local-unconfirmed" } as const;
const projection: OfflineReaderAnnotationProjection = { status: "present", origin, annotation };
const intent: UpsertReaderAnnotationIntent = {
  type: "upsert-annotation", namespaceKey: "account", bookId: "book", serverSessionId: null, intentRevision: 1, origin, annotation,
};

describe("Reader annotation desired state", () => {
  it("compares meaning independently of object property insertion order", () => {
    expect(sameAnnotation(annotation, {
      body: { note: "Note", color: "yellow", suffix: "After", prefix: "Before", text: "Quote" },
      location: { locationLabel: "Chapter", location: "range" }, kind: "highlight", clientId: "highlight",
    })).toBe(true);
  });

  it.each(["text", "prefix", "suffix", "color", "note"] as const)("includes highlight %s in equality", (field) => {
    expect(sameAnnotation(annotation, { ...annotation, body: { ...annotation.body, [field]: "changed" } })).toBe(false);
  });

  it("includes identity, kind, CFI, and label, without normalizing missing context into empty context", () => {
    expect(sameAnnotation(annotation, { ...annotation, clientId: "other" })).toBe(false);
    expect(sameAnnotation(annotation, { clientId: annotation.clientId, kind: "bookmark", location: annotation.location })).toBe(false);
    expect(sameAnnotation(annotation, { ...annotation, location: { ...annotation.location, location: "other" } })).toBe(false);
    expect(sameAnnotation(annotation, { ...annotation, location: { ...annotation.location, locationLabel: "other" } })).toBe(false);
    expect(sameAnnotation({ ...annotation, body: { ...annotation.body, prefix: undefined } },
      { ...annotation, body: { ...annotation.body, prefix: "" } })).toBe(false);
  });

  it("ignores origin for delivery matching but includes it when detecting projection changes", () => {
    const confirmed: OfflineReaderAnnotationProjection = { ...projection, origin: { kind: "server-confirmed", serverSessionId: "server" } };
    expect(projectionMatchesIntent(confirmed, intent)).toBe(true);
    expect(sameProjection(projection, confirmed)).toBe(false);
    expect(sameProjection(confirmed, { ...confirmed, origin: { kind: "server-confirmed", serverSessionId: "other" } })).toBe(false);
  });

  it("matches deletes only to their tombstone, never to a present annotation or absence", () => {
    const deleted = { type: "delete-annotation" as const, namespaceKey: "account", bookId: "book", serverSessionId: "server",
      intentRevision: 2, clientId: "highlight", origin: { kind: "server-confirmed" as const, serverSessionId: "server" } };
    expect(projectionMatchesIntent(projection, deleted)).toBe(false);
    expect(projectionMatchesIntent(undefined, deleted)).toBe(false);
    expect(projectionMatchesIntent({ status: "deleted", clientId: "highlight", origin }, deleted)).toBe(true);
    expect(projectionMatchesIntent({ status: "deleted", clientId: "other", origin }, deleted)).toBe(false);
  });

  it("upserts bookmark/highlight by client identity and preserves unrelated annotations sharing a CFI", () => {
    const bookmark = { clientId: "bookmark", kind: "bookmark" as const, location: annotation.location };
    const created = applyAnnotationMutation([projection], { action: "upsert", annotation: bookmark }, origin);
    expect(created).toHaveLength(2);
    const updated = applyAnnotationMutation(created, { action: "upsert", annotation: { ...annotation, body: { ...annotation.body, note: "Edited" } } }, origin);
    expect(updated).toHaveLength(2);
    expect(updated[0]).toMatchObject({ annotation: { body: { note: "Edited" } } });
    expect(updated[1]).toEqual(created[1]);
    expect(applyAnnotationMutation(updated, { action: "delete", clientId: "highlight" }, origin)).toEqual([created[1]]);
  });
});
