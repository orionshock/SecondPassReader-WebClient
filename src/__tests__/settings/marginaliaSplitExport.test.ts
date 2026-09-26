import { describe, expect, it } from "vitest";
import {
  buildAllZipEntries,
  filterMarginaliaBookGroups,
  groupMarginaliaSplitItems,
  parseAndSplitMarginaliaExport,
  splitMarginaliaExport,
} from "../../features/settings/MarginaliaSplitExport.Actions";

const PROFILE = "https://secondpasslibrary.local/specs/marginalia/0.1.0";
const CFI = "epubcfi(/6/8!/4/2[chapter])";

describe("marginalia split export", () => {
  it("splits canonical archives by Reading Session without changing locations", () => {
    const result = splitMarginaliaExport(archive([
      book("Book One", [session("session-1", [highlight("highlight-1", CFI)]), session("session-2", [])]),
      book("Book Two", [session("session-3", [bookmark("bookmark-1", "epubcfi(/6/10!/4/2)")])]),
    ]));

    expect(result.summary).toEqual({ bookCount: 2, sessionCount: 3, annotationCount: 2 });
    expect(result.items).toHaveLength(3);
    const firstBook = (result.items[0]!.exportJson.books as any[])[0];
    expect(firstBook.readingSessions).toHaveLength(1);
    expect(firstBook.readingSessions[0].annotations[0].location).toEqual({
      location: CFI,
      locationLabel: "042% - Chapter",
    });
    expect(firstBook.readingSessions[0].annotations[0].location).not.toHaveProperty("cfi");
    expect(firstBook.readingSessions[0].progress.location).toBe(CFI);
  });

  it("groups split files by Book and filters empty Reading Sessions without mutating the base result", () => {
    const split = splitMarginaliaExport(archive([
      book("Book", [session("with-annotation", [bookmark("bookmark", CFI)]), session("empty", [])]),
    ]));
    const groups = groupMarginaliaSplitItems(split.items);
    const filtered = filterMarginaliaBookGroups(groups, true);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toHaveLength(2);
    expect(filtered[0]!.items.map((item) => item.session.sourceReadingSessionId)).toEqual(["with-annotation"]);
    expect(buildAllZipEntries(filtered)[0]!.path).toMatch(/\.json$/);
  });

  it("rejects old generic cfi fields in progress and annotation locations", () => {
    const oldProgress = archive([book("Book", [{
      ...session("session", []),
      progress: { cfi: CFI, updatedAt: "2026-01-02T00:00:00Z" },
    }])]);
    const oldAnnotation = archive([book("Book", [session("session", [{
      ...bookmark("bookmark", CFI),
      location: { cfi: CFI },
    }])])]);

    expect(() => splitMarginaliaExport(oldProgress)).toThrow(/location/);
    expect(() => splitMarginaliaExport(oldAnnotation)).toThrow(/location\.location/);
  });

  it("parses JSON and rejects legacy or unsupported envelope shapes", () => {
    expect(parseAndSplitMarginaliaExport(JSON.stringify(archive([book("Book", [])])))).toEqual({
      summary: { bookCount: 1, sessionCount: 0, annotationCount: 0 },
      items: [],
    });
    expect(() => parseAndSplitMarginaliaExport("{broken")).toThrow();
    expect(() => splitMarginaliaExport({ schema_version: "0.1.0", books: [] })).toThrow();
    expect(() => splitMarginaliaExport({ ...archive([]), schemaVersion: "9.9.9" })).toThrow();
  });
});

function archive(books: unknown[]) {
  return {
    type: "SecondPassMarginaliaExport",
    schemaVersion: "0.1.0",
    profile: PROFILE,
    generatedAt: "2026-01-03T00:00:00Z",
    generator: "Second Pass Library",
    books,
  };
}

function book(title: string, readingSessions: unknown[]) {
  return { title, authors: ["Author"], readingSessions };
}

function session(sourceReadingSessionId: string, annotations: unknown[]) {
  return {
    sourceReadingSessionId,
    name: sourceReadingSessionId,
    notes: "",
    status: "closed",
    startedAt: "2026-01-01T00:00:00Z",
    closedAt: "2026-01-02T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    progress: { location: CFI, locationLabel: "042% - Chapter", updatedAt: "2026-01-02T00:00:00Z" },
    annotations,
  };
}

function bookmark(clientAnnotationId: string, location: string) {
  return {
    clientAnnotationId,
    kind: "bookmark",
    location: { location, locationLabel: "042% - Chapter" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function highlight(clientAnnotationId: string, location: string) {
  return {
    ...bookmark(clientAnnotationId, location),
    kind: "highlight",
    body: { text: "Selected text", prefix: "Before", suffix: "After", color: "green", note: "Note" },
  };
}
