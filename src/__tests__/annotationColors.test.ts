import { describe, expect, it } from "vitest";
import { toAnnotationCssVars } from "../features/reader/annotations/annotationColors";

describe("toAnnotationCssVars", () => {
  it("maps named colors to rgba vars", () => {
    const v = toAnnotationCssVars("yellow");
    expect(v.color).toContain("rgba(");
    expect(v.bg).toContain("rgba(");
  });

  it("maps hex colors to rgba vars", () => {
    const v = toAnnotationCssVars("#ff0000");
    expect(v.color).toBe("rgba(255, 0, 0, 0.55)");
    expect(v.bg).toBe("rgba(255, 0, 0, 0.10)");
  });

  it("falls back for unknown colors", () => {
    const v = toAnnotationCssVars("not-a-color");
    expect(v.color).toContain("rgba(");
  });
});

