import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "../app/App.Header";
import { routeToHash } from "../app/AppNavigation.Router";

describe("App header navigation", () => {
  it("renders an icon-only Home button before the existing navigation", () => {
    const html = renderToStaticMarkup(createElement(AppHeader, {
      profile: null,
      view: "main",
      route: { kind: "library" },
      canNavigate: true,
      onShowHome: vi.fn(),
      onShowLibrary: vi.fn(),
      onShowSessions: vi.fn(),
      onShowShelves: vi.fn(),
      onShowSettings: vi.fn(),
    }));

    expect(html).toContain('aria-label="Home"');
    expect(html).toContain('<span class="material-symbols-outlined" aria-hidden="true">home</span>');
    expect(html.indexOf('aria-label="Home"')).toBeLessThan(
      html.indexOf('<button type="button" class="button buttonCompact">Library</button>'),
    );
    expect(routeToHash({ kind: "home" })).toBe("#/home");
  });
});
