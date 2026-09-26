import { describe, expect, it } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import {
  getAnnotationDisplayTexts,
  getRawAnnotationDisplay,
  resolveAnnotationColor,
  toAnnotationCssVars,
} from "../../../features/reader/display/ReaderAnnotation.Presenter";

const highlight = {
  id: "highlight-1",
  clientId: "client-1",
  kind: "highlight",
  location: { location: "epubcfi(/6/2,/4,/8)", locationLabel: "Chapter 01" },
  body: { text: "Quoted text", prefix: "", suffix: "", color: "yellow", note: "Reader note" },
  createdAt: "created",
  updatedAt: "updated",
} satisfies MarginaliaAnnotation;

const bookmark = {
  id: "bookmark-1",
  clientId: "client-2",
  kind: "bookmark",
  location: { location: "epubcfi(/6/2)", locationLabel: "Chapter 01" },
  createdAt: "created",
  updatedAt: "updated",
} satisfies MarginaliaAnnotation;

describe("toAnnotationCssVars", () => {
  it("maps existing named colors exactly", () => {
    expect(resolveAnnotationColor("yellow")).toBe("#facc15");
    expect(resolveAnnotationColor("green")).toBe("#22c55e");
    expect(resolveAnnotationColor("blue")).toBe("#3b82f6");
    expect(resolveAnnotationColor("pink")).toBe("#ec4899");
    expect(resolveAnnotationColor("purple")).toBe("#a855f7");
    expect(resolveAnnotationColor("orange")).toBe("#f97316");
    expect(resolveAnnotationColor("red")).toBe("#ef4444");
    expect(toAnnotationCssVars("yellow")).toEqual({
      color: "rgba(250, 204, 21, 0.55)",
      bg: "rgba(250, 204, 21, 0.10)",
    });
  });

  it("maps hex colors to rgba vars", () => {
    const v = toAnnotationCssVars("#ff0000");
    expect(v.color).toBe("rgba(255, 0, 0, 0.55)");
    expect(v.bg).toBe("rgba(255, 0, 0, 0.10)");
  });

  it("uses the existing fallback for unknown or missing colors", () => {
    const fallback = {
      color: "rgba(59, 130, 246, 0.55)",
      bg: "rgba(59, 130, 246, 0.08)",
    };
    expect(toAnnotationCssVars("not-a-color")).toEqual(fallback);
    expect(toAnnotationCssVars(undefined)).toEqual(fallback);
    expect(resolveAnnotationColor("not-a-color")).toBeNull();
  });

  it("presents shared quote, note, and annotation labels", () => {
    expect(getAnnotationDisplayTexts(highlight)).toEqual({ quote: "Quoted text", note: "Reader note" });
    expect(getAnnotationDisplayTexts(bookmark)).toEqual({ quote: null, note: null });
    expect(getRawAnnotationDisplay(highlight, "Reader note")).toEqual({
      iconName: "chat_bubble",
      label: "Commented highlight",
    });
    expect(getRawAnnotationDisplay(bookmark, null)).toEqual({ iconName: "bookmark", label: "Bookmark" });
  });
});
