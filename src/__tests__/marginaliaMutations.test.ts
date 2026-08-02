import { describe, expect, it } from "vitest";
import { buildBookmarkUpsert, buildHighlightUpsert, buildMarginaliaProgressInput, toMarginaliaLocationLabel } from "../features/reader/session/marginaliaMutations";

describe("Reader marginalia mutations", () => {
  it("maps progress location labels without changing their text", () => {
    expect(buildMarginaliaProgressInput("epubcfi(/6/2)", "Chapter 08 - The Blackstaff - 42%")).toEqual({ cfi: "epubcfi(/6/2)", locationLabel: "Chapter 08 - The Blackstaff - 42%" });
    expect(toMarginaliaLocationLabel("x".repeat(300))).toHaveLength(255);
  });

  it("keeps bookmark upserts body-free", () => {
    const operation = buildBookmarkUpsert({ clientId: "client-b", cfi: "point", locationLabel: "Location 08 - 42%" });
    expect(operation).not.toHaveProperty("annotation.body");
  });

  it("includes the complete highlight body", () => {
    const operation = buildHighlightUpsert({ clientId: "client-h", cfi: "range", locationLabel: "Chapter 08 - 42%", text: "Quote", color: "blue", note: "Note", prefix: "Before", suffix: "After" });
    expect(operation).toHaveProperty("annotation.body", { text: "Quote", color: "blue", note: "Note", prefix: "Before", suffix: "After" });
  });
});
