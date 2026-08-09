import { describe, expect, it } from "vitest";
import { formatAnnotationCount, formatIso } from "../features/sessions/sessionDetailDisplay";

describe("sessionDetailDisplay", () => {
  it("formats annotation counts and ISO timestamps", () => {
    expect(formatAnnotationCount(1)).toBe("1 annotation");
    expect(formatAnnotationCount(2.9)).toBe("2 annotations");
    expect(formatIso("not-a-date")).toBe("not-a-date");
  });
});
