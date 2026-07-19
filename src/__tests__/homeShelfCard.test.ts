import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Shelf } from "@secondpass/client";
import { HomeShelfCard } from "../features/home/HomeShelfCard";

describe("Home shelf cards", () => {
  it("renders the exact server shelf name, count, owner, and shelf route", () => {
    const html = render(shelf({
      id: "shelf one",
      name: "Group Name - Group Name - Favorites",
      item_count: 12,
      owner_type: "group",
      owner_group: { id: "group-1", name: "Group Name" },
    }), "#/shelves/shelf%20one");

    expect(html).toContain("Group Name - Group Name - Favorites");
    expect(html).toContain("12 books");
    expect(html).toContain('href="#/shelves/shelf%20one"');
    expect(html).toContain('aria-label="Open shelf Group Name - Group Name - Favorites, 12 books"');
  });

  it("renders available preview covers", () => {
    const html = render(shelf({
      preview_books: [{ id: "book-1", title: "Preview Book", cover_url: "/covers/book-1.jpg" }],
    }));

    expect(html).toContain('src="https://library.example/covers/book-1.jpg"');
    expect(html).toContain('title="Preview Book"');
    expect(html).not.toContain("No books");
  });

  it("renders a compact placeholder when no previews are available", () => {
    const html = render(shelf({ preview_books: [] }));

    expect(html).toContain("homeShelfCoverEmpty");
    expect(html).toContain("No books");
  });
});

function render(value: Shelf, href = "#/shelves/shelf-1") {
  return renderToStaticMarkup(createElement(HomeShelfCard, {
    shelf: value,
    baseUrl: "https://library.example/app/",
    href,
  }));
}

function shelf(overrides: Partial<Shelf>): Shelf {
  return {
    id: "shelf-1",
    name: "Shelf",
    owner_type: "user",
    item_count: 0,
    ...overrides,
  };
}
