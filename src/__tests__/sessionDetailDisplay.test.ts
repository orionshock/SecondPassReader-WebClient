import { describe, expect, it } from "vitest";
import { formatAnnotationCount, formatIso, getAnnotationTexts } from "../features/sessions/sessionDetailDisplay";

describe("sessionDetailDisplay", () => {
  it("formats annotation counts and ISO timestamps", () => {
    expect(formatAnnotationCount(1)).toBe("1 annotation");
    expect(formatAnnotationCount(2.9)).toBe("2 annotations");
    expect(formatIso("not-a-date")).toBe("not-a-date");
  });

  it("reads highlight bodies and keeps bookmarks body-free", () => {
    expect(getAnnotationTexts({ id: "h", clientId: "ch", kind: "highlight", location: { cfi: "cfi", locationLabel: "Chapter 1" }, body: { text: "Quote", prefix: "", suffix: "", color: "yellow", note: "Note" }, createdAt: "now", updatedAt: "now" })).toEqual({ quote: "Quote", note: "Note" });
    expect(getAnnotationTexts({ id: "b", clientId: "cb", kind: "bookmark", location: { cfi: "cfi", locationLabel: "Chapter 1" }, createdAt: "now", updatedAt: "now" })).toEqual({ quote: null, note: null });
  });
});
