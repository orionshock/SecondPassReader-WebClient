import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MarginaliaRecentSession } from "@secondpass/client";
import { RecentReadingCarousel } from "../../features/library/RecentReadingCarousel.UI";
import { RecentReadingSection } from "../../features/library/RecentReadingPanel.UI";
import { rawSessionId, recentSessionFixture } from "../sessions/SessionTest.Fixtures";

describe("Home recent reading carousel", () => {
  it("renders View all as a Sessions link", () => {
    const html = renderToStaticMarkup(createElement(RecentReadingSection, {
      connection: null,
      preview: {
        busy: false,
        error: null,
        data: null,
        canLoad: false,
        showClosed: false,
        toggleClosed: vi.fn(),
        retry: vi.fn(),
        resume: vi.fn(),
      },
    }));

    expect(html).toContain('href="#/sessions"');
  });

  it("keeps Reader targets and useful accessible card names", () => {
    const html = renderCarousel([recentSessionFixture({
      book: { id: "book-1", title: "The Left Hand of Darkness", coverUrl: null, canOpen: true },
    })]);

    expect(html).toContain('href="#/reader/book-1"');
    expect(html).toMatch(/aria-label="Resume The Left Hand of Darkness, last read [^"]+"/);
  });

  it("renders labeled carousel controls for multiple recent items", () => {
    const html = renderCarousel([
      recentSessionFixture(),
      recentSessionFixture({ id: "session-2", book: { id: "book-2", title: "Book Two", coverUrl: null, canOpen: true } }),
    ]);

    expect(html).toContain('aria-label="Scroll Recent History left"');
    expect(html).toContain('aria-label="Scroll Recent History right"');
  });

  it("uses the short display-name suffix for an unnamed session without exposing its full id", () => {
    const session = recentSessionFixture({ id: rawSessionId, name: "" });

    const html = renderCarousel([session]);

    expect(html).toContain("5a7445");
    expect(html).not.toContain(session.id);
  });
});

function renderCarousel(items: MarginaliaRecentSession[]): string {
  return renderToStaticMarkup(createElement(RecentReadingCarousel, {
    items,
    connection: null,
    disabled: false,
    onResume: vi.fn(),
  }));
}
