import { describe, expect, it } from "vitest";
import {
  buildBookmarkUpsert,
  buildHighlightUpdate,
  buildHighlightUpsert,
  buildMarginaliaProgressInput,
  normalizeHighlightText,
  normalizeOptionalHighlightContext,
  toMarginaliaLocationLabel,
} from "../features/reader/session/marginaliaMutations";

describe("Reader marginalia mutations", () => {
  it("maps progress location labels without changing their text", () => {
    expect(buildMarginaliaProgressInput("epubcfi(/6/2)", "Chapter 08 - The Blackstaff - 42%")).toEqual({ cfi: "epubcfi(/6/2)", locationLabel: "Chapter 08 - The Blackstaff - 42%" });
    expect(toMarginaliaLocationLabel("x".repeat(300))).toHaveLength(255);
  });

  it("keeps bookmark upserts body-free", () => {
    const operation = buildBookmarkUpsert({ clientId: "client-b", cfi: "point", locationLabel: "Location 08 - 42%" });
    expect(operation).not.toHaveProperty("annotation.body");
  });

  it("normalizes highlight prose and context while preserving notes and labels", () => {
    const operation = buildHighlightUpsert({
      clientId: "client-h",
      cfi: "  epubcfi(/6/2)  ",
      locationLabel: "  Chapter 08  -  42%  ",
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
      cfi: "  epubcfi(/6/2)  ",
      locationLabel: "  Chapter 08  -  42%  ",
    });
  });

  it("normalizes quote fields on highlight updates without changing note whitespace", () => {
    const operation = buildHighlightUpdate({
      id: "highlight-1",
      clientId: "client-h",
      kind: "highlight",
      location: { cfi: "range", locationLabel: " Label  stays " },
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
