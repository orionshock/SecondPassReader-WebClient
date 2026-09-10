import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Shelf } from "@secondpass/client";
import { HomeShelfCard } from "../../features/home/HomeShelfCard.UI";

describe("Home shelf cards", () => {
  it("renders the exact server shelf name and group ownership with count", () => {
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
    expect(html).toContain('aria-label="Open shelf Group Name - Group Name - Favorites, group Group Name, 12 books"');
  });

  it("renders user ownership with count", () => {
    const html = render(shelf({
      name: "Favorites",
      item_count: 6,
      owner_user: { profile_id: "user-1", username: "eismusd" },
    }));

    expect(html).toContain("eismusd");
    expect(html).toContain("6 books");
    expect(html).toContain('aria-label="Open shelf Favorites, user eismusd, 6 books"');
  });

  it("renders count only when owner metadata is missing", () => {
    const html = render(shelf({ item_count: 6, owner_user: null }));

    expect(html).toContain("6 books");
    expect(html).toContain('aria-label="Open shelf Shelf, 6 books"');
  });

  it("renders available preview covers", () => {
    const html = render(shelf({
      preview_books: [{ id: "book-1", title: "Preview Book", cover_url: "/covers/book-1.jpg" }],
    }));

    expect(html).toContain('src="https://library.example/covers/book-1.jpg"');
    expect(html).toContain('title="Preview Book"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("No books");
  });

  it("renders a compact placeholder when no previews are available", () => {
    const html = render(shelf({ preview_books: [] }));

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
