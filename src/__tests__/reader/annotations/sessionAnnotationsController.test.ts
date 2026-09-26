import { describe, expect, it } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import {
  getSeedAnnotationsFromOpen,
  getSessionAnnotationsActiveKey,
} from "../../../features/reader/session/annotations/SessionAnnotations.Controller";

describe("session annotation controller helpers", () => {
  it("keys annotations by book, object URL, and session", () => {
    expect(getSessionAnnotationsActiveKey({ bookId: 42, objectUrl: "blob:book-a", sessionId: "session-a" })).toBe(
      "42|blob:book-a|session-a",
    );
    expect(getSessionAnnotationsActiveKey({ bookId: 42, objectUrl: "blob:book-b", sessionId: "session-a" })).toBe(
      "42|blob:book-b|session-a",
    );
    expect(getSessionAnnotationsActiveKey({ bookId: 42, objectUrl: "blob:book-a", sessionId: null })).toBe(
      "42|blob:book-a|",
    );
  });

  it("treats an empty bootstrap annotation page as an explicit empty seed", () => {
    expect(getSeedAnnotationsFromOpen([])).toEqual([]);
    expect(getSeedAnnotationsFromOpen(null)).toBeNull();
    expect(getSeedAnnotationsFromOpen(undefined)).toBeNull();
  });

  it("copies bootstrap annotations before seeding controller state", () => {
    const annotation = {
      id: "annotation-a",
      clientId: "client-a",
      kind: "bookmark",
      location: { location: "epubcfi(/6/2)", locationLabel: "Chapter 1" },
      createdAt: "now",
      updatedAt: "now",
    } satisfies MarginaliaAnnotation;
    const input = [annotation];
    const seeded = getSeedAnnotationsFromOpen(input);
    expect(seeded).toEqual(input);
    expect(seeded).not.toBe(input);
  });
});
