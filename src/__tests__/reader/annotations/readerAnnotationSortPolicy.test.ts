import { describe, expect, it } from "vitest";
import { sortReaderAnnotations, type ReaderAnnotationSortMode } from "../../../features/reader/annotations/ReaderAnnotationSort.Policy";

const EARLY = "epubcfi(/6/4[chapter]!/4/4:0)";
const MIDDLE_RANGE = "epubcfi(/6/4[chapter]!/4/8,/2:4,/6:9)";
const LATE = "epubcfi(/6/4[chapter]!/4/10:0)";

type Item = {
  id: string;
  createdAt: string;
  updatedAt: string;
  cfi?: string;
  cfiRange?: string;
};

function item(id: string, input: Partial<Omit<Item, "id">> = {}): Item {
  return {
    id,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    cfi: EARLY,
    ...input,
  };
}

function ids(items: Item[], mode: ReaderAnnotationSortMode): string[] {
  return sortReaderAnnotations(items, mode).map((annotation) => annotation.id);
}

describe("Reader annotation sorting", () => {
  it("sorts Last updated newest first and falls back to created time", () => {
    expect(ids([
      item("old", { updatedAt: "2026-01-02T00:00:00Z" }),
      item("fallback", { createdAt: "2026-01-04T00:00:00Z", updatedAt: "" }),
      item("new", { updatedAt: "2026-01-03T00:00:00Z" }),
    ], "updated")).toEqual(["fallback", "new", "old"]);
  });

  it("sorts Created newest first", () => {
    expect(ids([
      item("old", { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z" }),
      item("new", { createdAt: "2026-01-03T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z" }),
    ], "created")).toEqual(["new", "old"]);
  });

  it("uses structural EPUB order instead of lexical CFI order", () => {
    const annotations = [item("late", { cfi: LATE }), item("early", { cfi: EARLY })];
    expect(LATE.localeCompare(EARLY)).toBeLessThan(0);
    expect(ids(annotations, "location")).toEqual(["early", "late"]);
  });

  it("sorts a range by its start and accepts structural element ID assertions", () => {
    expect(ids([
      item("late", { cfi: LATE }),
      item("range", { cfi: undefined, cfiRange: MIDDLE_RANGE }),
      item("early", { cfi: EARLY }),
    ], "location")).toEqual(["early", "range", "late"]);
  });

  it("puts malformed locations last without rewriting input values", () => {
    const malformed = "epubcfi(/6/4!/not-a-step)";
    const annotations = [item("bad", { cfi: malformed }), item("good", { cfi: EARLY })];
    const sorted = sortReaderAnnotations(annotations, "location");
    expect(sorted.map((annotation) => annotation.id)).toEqual(["good", "bad"]);
    expect(sorted[1]?.cfi).toBe(malformed);
    expect(annotations[0]?.cfi).toBe(malformed);
  });

  it("uses deterministic location and identity tie-breakers", () => {
    expect(ids([
      item("z", { cfi: LATE }),
      item("b", { cfi: EARLY }),
      item("a", { cfi: EARLY }),
    ], "updated")).toEqual(["a", "b", "z"]);
  });
});
