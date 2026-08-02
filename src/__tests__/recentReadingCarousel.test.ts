import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MarginaliaRecentSession } from "@secondpass/client";
import { RecentReadingCarousel } from "../features/library/RecentReadingCarousel";
import { RecentReadingSection } from "../features/library/RecentReadingSection";

describe("Home recent reading carousel", () => {
  it("renders View all as a Sessions link", () => {
    const html = renderToStaticMarkup(createElement(RecentReadingSection, { profile: null, spl: null }));

    expect(html).toContain("View all");
    expect(html).toContain('href="#/sessions"');
  });

  it("keeps Reader targets and useful accessible card names", () => {
    const html = renderCarousel([recentSession("session-1", "book-1", "The Left Hand of Darkness")]);

    expect(html).toContain('href="#/reader/book-1"');
    expect(html).toMatch(/aria-label="Resume The Left Hand of Darkness, last read [^"]+"/);
    expect(html).toContain('class="recentBookMeta"');
    expect(html).not.toContain('class="recentBookMeta">Last read');
    expect(html).toContain('class="recentProgressLabel">Chapter 08 - 42%</span>');
    expect(html).toContain("Active");
  });

  it("renders labeled carousel controls for multiple recent items", () => {
    const html = renderCarousel([
      recentSession("session-1", "book-1", "Book One"),
      recentSession("session-2", "book-2", "Book Two"),
    ]);

    expect(html).toContain('aria-label="Scroll recent reading left"');
    expect(html).toContain('aria-label="Scroll recent reading right"');
    expect(html).toContain(">chevron_left</span>");
    expect(html).toContain(">chevron_right</span>");
  });
});

function renderCarousel(items: MarginaliaRecentSession[]): string {
  return renderToStaticMarkup(createElement(RecentReadingCarousel, {
    items,
    profile: null,
    disabled: false,
    onResume: vi.fn(),
  }));
}

function recentSession(id: string, bookId: string, title: string): MarginaliaRecentSession {
  return {
    id,
    name: "Evening reading",
    status: "active",
    lastActivityAt: "2026-08-02T12:00:00Z",
    book: { id: bookId, title, coverUrl: null, canOpen: true },
    progress: {
      cfi: "epubcfi(/6/8!/4/2)",
      locationLabel: "Chapter 08 - 42%",
      updatedAt: "2026-08-02T12:00:00Z",
    },
  };
}
