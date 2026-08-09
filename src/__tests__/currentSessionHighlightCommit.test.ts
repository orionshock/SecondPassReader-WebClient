import { describe, expect, it, vi } from "vitest";
import type { MarginaliaAnnotation, MarginaliaHighlight } from "@secondpass/client";
import { buildCurrentSessionHighlightCommit } from "../features/reader/session/marginaliaMutations";

const exactCfi = "epubcfi(/6/10!/4/2,/1:0,/1:20)";

function highlight(cfi = exactCfi): MarginaliaHighlight {
  return {
    id: "highlight-1",
    clientId: "existing-client",
    kind: "highlight",
    location: { cfi, locationLabel: "Existing chapter" },
    body: {
      text: "Existing quote",
      prefix: "Existing prefix",
      suffix: "Existing suffix",
      color: "yellow",
      note: "Existing note",
    },
    createdAt: "created",
    updatedAt: "updated",
  };
}

function commit(currentAnnotations: MarginaliaAnnotation[], overrides?: Partial<{
  cfi: string;
  color: "blue" | "pink";
  note: string;
}>) {
  const createClientId = vi.fn(() => "new-client");
  const result = buildCurrentSessionHighlightCommit({
    currentAnnotations,
    createClientId,
    cfi: overrides?.cfi ?? exactCfi,
    locationLabel: "New chapter",
    text: "New quote",
    prefix: "New prefix",
    suffix: "New suffix",
    color: overrides?.color ?? "blue",
    note: overrides?.note,
  });
  return { createClientId, result };
}

describe("current-session highlight commit", () => {
  it("creates a new highlight when no exact current-session highlight exists", () => {
    const bookmarkAtSameCfi: MarginaliaAnnotation = {
      id: "bookmark-1",
      clientId: "bookmark-client",
      kind: "bookmark",
      location: { cfi: exactCfi, locationLabel: "Bookmark" },
      createdAt: "created",
      updatedAt: "updated",
    };

    const { createClientId, result } = commit([bookmarkAtSameCfi]);

    expect(result.kind).toBe("created");
    expect(createClientId).toHaveBeenCalledOnce();
    expect(result.operation).toMatchObject({
      action: "upsert",
      annotation: {
        clientId: "new-client",
        kind: "highlight",
        location: { cfi: exactCfi },
      },
    });
  });

  it("updates an exact-CFI current highlight with staged color and note without creating an id", () => {
    const { createClientId, result } = commit([highlight()], { color: "pink", note: "New staged note" });

    expect(result.kind).toBe("updated");
    expect(createClientId).not.toHaveBeenCalled();
    expect(result.operation).toMatchObject({
      action: "upsert",
      annotation: {
        clientId: "existing-client",
        location: { cfi: exactCfi, locationLabel: "Existing chapter" },
        body: {
          text: "Existing quote",
          prefix: "Existing prefix",
          suffix: "Existing suffix",
          color: "pink",
          note: "New staged note",
        },
      },
    });
  });

  it("preserves the existing note when the staged commit does not supply one", () => {
    const { result } = commit([highlight()], { color: "blue" });

    expect(result.operation).toHaveProperty("annotation.body.note", "Existing note");
    expect(result.operation).toHaveProperty("annotation.body.color", "blue");
  });

  it("does not treat a merely overlapping or different CFI as a duplicate", () => {
    const differentCfi = "epubcfi(/6/10!/4/2,/1:0,/1:21)";
    const { createClientId, result } = commit([highlight(differentCfi)]);

    expect(result.kind).toBe("created");
    expect(createClientId).toHaveBeenCalledOnce();
  });

  it("does not consider a previous-session same-CFI highlight", () => {
    const annotationLayers = {
      current: [] as MarginaliaAnnotation[],
      previous: [highlight()],
    };
    const { createClientId, result } = commit(annotationLayers.current);

    expect(annotationLayers.previous).toHaveLength(1);
    expect(result.kind).toBe("created");
    expect(createClientId).toHaveBeenCalledOnce();
  });
});
