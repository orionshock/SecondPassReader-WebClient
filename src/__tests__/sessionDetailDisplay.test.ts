import { describe, expect, it } from "vitest";
import {
  formatAnnotationCount,
  formatIso,
  formatProgress,
  normalizeStatus,
} from "../features/sessions/SessionDetail.Presenter";
import { getSessionDisplayName } from "../features/sessions/SessionDisplayName.Presenter";

describe("sessionDetailDisplay", () => {
  it("formats zero, singular, plural, and clamped annotation counts", () => {
    expect(formatAnnotationCount(0)).toBe("0 annotations");
    expect(formatAnnotationCount(1)).toBe("1 annotation");
    expect(formatAnnotationCount(2.9)).toBe("2 annotations");
    expect(formatAnnotationCount(-2)).toBe("0 annotations");
  });

  it("omits invalid annotation counts", () => {
    expect(formatAnnotationCount()).toBeNull();
    expect(formatAnnotationCount(null)).toBeNull();
    expect(formatAnnotationCount(Number.NaN)).toBeNull();
    expect(formatAnnotationCount(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("formats valid timestamps and preserves invalid timestamps", () => {
    const iso = "2026-08-09T00:00:00Z";
    expect(formatIso(iso)).toBe(new Date(iso).toLocaleString());
    expect(formatIso("not-a-date")).toBe("not-a-date");
    expect(formatIso()).toBeNull();
    expect(formatIso(null)).toBeNull();
  });

  it("formats and clamps finite progress values", () => {
    expect(formatProgress(0)).toBe("0%");
    expect(formatProgress(0.421)).toBe("42%");
    expect(formatProgress(-1)).toBe("0%");
    expect(formatProgress(2)).toBe("100%");
    expect(formatProgress()).toBeNull();
    expect(formatProgress(null)).toBeNull();
    expect(formatProgress(Number.NaN)).toBeNull();
  });

  it("normalizes known, custom, and inferred session statuses", () => {
    expect(normalizeStatus("completed", true)).toBe("active");
    expect(normalizeStatus(" Completed ")).toBe("completed");
    expect(normalizeStatus("ARCHIVED")).toBe("archived");
    expect(normalizeStatus("paused")).toBe("paused");
    expect(normalizeStatus(null, false)).toBe("completed");
    expect(normalizeStatus()).toBe("active");
  });

  it("preserves saved display names and adds only a short id suffix to unnamed sessions", () => {
    expect(getSessionDisplayName("  Initial Kindle Import 49d47f  ")).toBe("Initial Kindle Import 49d47f");
    expect(getSessionDisplayName("Unnamed session 49d47f")).toBe("Unnamed session 49d47f");
    expect(getSessionDisplayName("  ", "51388269-2a4b-4a13-8428-7b57805a7445")).toBe("Unnamed Session 5a7445");
    expect(getSessionDisplayName("", "short")).toBe("Unnamed Session");
  });
});
