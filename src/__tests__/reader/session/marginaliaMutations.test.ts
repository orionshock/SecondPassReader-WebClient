import { describe, expect, it } from "vitest";
import {
  buildBookmarkUpsert,
  buildHighlightUpdate,
  buildHighlightUpsert,
  buildMarginaliaProgressInput,
  normalizeHighlightText,
  normalizeOptionalHighlightContext,
  toMarginaliaLocationLabel,
} from "../../../features/reader/session/ReadingSessionMarginalia.Actions";
import { buildSavedReaderLocationLabel } from "../../../features/reader/display/ReaderLocation.Presenter";

describe("Reader marginalia mutations", () => {
  it("maps progress location labels without changing their text", () => {
    expect(buildMarginaliaProgressInput("epubcfi(/6/2)", "Chapter 08 - The Blackstaff - 42%")).toEqual({ location: "epubcfi(/6/2)", locationLabel: "Chapter 08 - The Blackstaff - 42%" });
    expect(toMarginaliaLocationLabel("x".repeat(300))).toHaveLength(255);
  });

  it("keeps bookmark upserts body-free", () => {
    const locationLabel = buildSavedReaderLocationLabel({ toc: null, location: { locationIndex: 7, bookProgress: 0.42 } });
    const operation = buildBookmarkUpsert({ clientId: "client-b", cfi: "epubcfi(/6/4!/4/2/1:7)", locationLabel });
    expect(operation).not.toHaveProperty("annotation.body");
    expect(operation).toHaveProperty("annotation.location.locationLabel", "042% - Location");
  });

  it("normalizes highlight prose and context while preserving notes and labels", () => {
    const locationLabel = buildSavedReaderLocationLabel({
      toc: [{ id: "ch8", label: "Chapter 08", href: "chapter-8.xhtml" }],
      location: { sectionIndex: 7, href: "chapter-8.xhtml", bookProgress: 0.42 },
    });
    const operation = buildHighlightUpsert({
      clientId: "client-h",
      cfi: "  epubcfi(/6/2)  ",
      locationLabel,
      text: "  One\n\n Apocalypses\t always   kick off...  ",
      color: "blue",
      note: "  User note\nwith intentional spacing  ",
      prefix: "  Before\n\n the\tquote  ",
      suffix: "  After\n the   quote  ",
    });
    expect(operation).toHaveProperty("annotation.body", {
      text: "One Apocalypses always kick off...",
      color: "blue",
      note: "  User note\nwith intentional spacing  ",
      prefix: "Before the quote",
      suffix: "After the quote",
    });
    expect(operation).toHaveProperty("annotation.location", {
      location: "  epubcfi(/6/2)  ",
      locationLabel: "042% - Chapter 08",
    });
  });

  it("normalizes quote fields on highlight updates without changing note whitespace", () => {
    const operation = buildHighlightUpdate({
      id: "highlight-1",
      clientId: "client-h",
      kind: "highlight",
      location: { location: "epubcfi(/6/4!/4/2,/1:2,/1:7)", locationLabel: " Label  stays " },
      body: {
        text: " Text\n with\tspaces ",
        prefix: " Prefix\n text ",
        suffix: " Suffix\t text ",
        color: "yellow",
        note: "old",
      },
      createdAt: "created",
      updatedAt: "updated",
    }, { color: "purple", note: "  exact\nnew note  " });

    expect(operation).toHaveProperty("annotation.body", {
      text: "Text with spaces",
      prefix: "Prefix text",
      suffix: "Suffix text",
      color: "purple",
      note: "  exact\nnew note  ",
    });
    expect(operation).toHaveProperty("annotation.location.locationLabel", " Label  stays ");
  });

  it("rejects highlight text that is blank after normalization", () => {
    expect(normalizeHighlightText(" a\n\tb ")).toBe("a b");
    expect(normalizeOptionalHighlightContext(undefined)).toBe("");
    expect(() => buildHighlightUpsert({ clientId: "client-h", cfi: "range", text: " \n\t ", color: "blue" })).toThrow(/must not be blank/);
  });
});
