import { describe, expect, it } from "vitest";
import {
  isExplicitProgressNavigationCommand,
  ReaderBootstrapProgressGuard,
} from "../features/reader/shell/ReaderBootstrapProgressGuard.State";

describe("reader bootstrap progress guard", () => {
  it("publishes only the authoritative restore CFI until explicit navigation", () => {
    const guard = new ReaderBootstrapProgressGuard();
    guard.reset(1, "epubcfi(/6/60!/4/76/1:0)");

    expect(guard.shouldPublishRelocation(1, "epubcfi(/6/60!/4/76/1:0)")).toBe(true);
    expect(guard.shouldPublishRelocation(1, "epubcfi(/6/60!/4/38/1:0)")).toBe(false);

    guard.recordExplicitNavigation(1);

    expect(guard.shouldPublishRelocation(1, "epubcfi(/6/60!/4/38/1:0)")).toBe(true);
  });

  it("keeps suppressing layout-derived relocations until navigation is explicit", () => {
    const guard = new ReaderBootstrapProgressGuard();
    guard.reset(3, "epubcfi(/6/10)");

    expect(guard.shouldPublishRelocation(3, "epubcfi(/6/8)")).toBe(false);
    expect(guard.shouldPublishRelocation(3, "epubcfi(/6/8)")).toBe(false);
  });

  it("classifies display and page actions as explicit but resize as layout-only", () => {
    expect(isExplicitProgressNavigationCommand({ type: "next" })).toBe(true);
    expect(isExplicitProgressNavigationCommand({ type: "previous" })).toBe(true);
    expect(isExplicitProgressNavigationCommand({
      type: "display",
      target: { type: "href", href: "chapter-2.xhtml" },
    })).toBe(true);
    expect(isExplicitProgressNavigationCommand({
      type: "displaySearchResult",
      cfi: "epubcfi(/6/12)",
    })).toBe(true);
    expect(isExplicitProgressNavigationCommand({ type: "resize" })).toBe(false);
  });

  it("allows default-open progress when no restore CFI exists", () => {
    const guard = new ReaderBootstrapProgressGuard();
    guard.reset(4, null);

    expect(guard.shouldPublishRelocation(4, "epubcfi(/6/2)")).toBe(true);
  });

  it("rejects stale relocations and resets protection for a new generation", () => {
    const guard = new ReaderBootstrapProgressGuard();
    guard.reset(5, "epubcfi(/6/20)");
    guard.recordExplicitNavigation(5);
    guard.reset(6, "epubcfi(/6/40)");

    expect(guard.shouldPublishRelocation(5, "epubcfi(/6/22)")).toBe(false);
    expect(guard.shouldPublishRelocation(6, "epubcfi(/6/22)")).toBe(false);
    expect(guard.shouldPublishRelocation(6, "epubcfi(/6/40)")).toBe(true);
  });
});
