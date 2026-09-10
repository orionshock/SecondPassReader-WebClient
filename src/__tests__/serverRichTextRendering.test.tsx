// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Author, Series, Shelf } from "@secondpass/client";
import { ServerRichText } from "../components/ServerRichText.Renderer";
import { SettingsLibraryServerPanel } from "../app/settings/SettingsLibraryServer.Panel";
import { LibrarySelectedAxisHeader } from "../features/library/results/LibrarySelectedAxis.Header";
import { ShelfEditInfoPanel } from "../features/shelves/ShelfEditInfo.Panel";

const noop = () => undefined;

describe("server descriptive rich text", () => {
  it("renders the complete limited HTML structure, entities, and plain text", () => {
    const html = renderToStaticMarkup(
      <ServerRichText value={'<p>A &amp; B<br><b>bold</b> <strong>strong</strong> <i>italic</i> <em>emphasis</em></p><ul><li>One</li></ul><ol><li>Two</li></ol>'} />,
    );
    expect(html).toContain("<p>A &amp; B<br><b>bold</b> <strong>strong</strong> <i>italic</i> <em>emphasis</em></p>");
    expect(html).toContain("<ul><li>One</li></ul><ol><li>Two</li></ol>");
    expect(html).not.toContain("&amp;amp;");

    const plain = renderToStaticMarkup(<ServerRichText value="Plain description" />);
    expect(plain).toContain(">Plain description</div>");
  });

  it("removes unsupported elements, attributes, and executable content at the rendering boundary", () => {
    const html = renderToStaticMarkup(
      <ServerRichText
        value={'<p class="lead" data-note="x" onclick="alert(1)">Safe <strong style="color:red">text</strong></p><section>Section text</section><a href="javascript:alert(1)">Link text</a><img src=x onerror="alert(1)"><script>alert(1)</script><style>body{display:none}</style>'}
      />,
    );

    expect(html).toContain("<p>Safe <strong>text</strong></p>");
    expect(html).toContain("Section text");
    expect(html).toContain("Link text");
    expect(html).not.toContain('class="lead"');
    expect(html).not.toMatch(/data-note=|onclick=|style=|href=|onerror=/);
    expect(html).not.toMatch(/<section|<a|<img|<script|<style|alert\(1\)|display:none/);
  });
  it("renders Author biographies and Series summaries structurally", () => {
    const author: Author = {
      id: "author-1",
      name: "Author",
      sortName: "Author",
      biography: "<p>Author <em>biography</em>.</p>",
      bookCount: 1,
      previewBooks: [],
    };
    const series: Series = {
      id: "series-1",
      name: "Series",
      sortName: "Series",
      summary: "<p>Series <strong>summary</strong>.</p>",
      bookCount: 1,
      previewBooks: [],
    };

    const authorHtml = renderToStaticMarkup(<LibrarySelectedAxisHeader kind="author" author={author} />);
    const seriesHtml = renderToStaticMarkup(<LibrarySelectedAxisHeader kind="series" series={series} />);
    expect(authorHtml).toContain("<p>Author <em>biography</em>.</p>");
    expect(seriesHtml).toContain("<p>Series <strong>summary</strong>.</p>");
  });

  it("renders the Shelf detail preview structurally without changing its model", () => {
    const shelf: Shelf = {
      id: "shelf-1",
      name: "Shelf",
      description: "<p>Shelf <i>description</i>.</p><ul><li>Item</li></ul>",
      owner_type: "user",
      owner_user: { profile_id: "profile-1", username: "reader" },
      visibility: "private",
      item_count: 0,
    };
    const html = renderToStaticMarkup(
      <ShelfEditInfoPanel shelf={shelf} canEdit onChangeInfo={noop} />,
    );
    expect(html).toContain("<p>Shelf <i>description</i>.</p><ul><li>Item</li></ul>");
  });

  it("renders the connected Server description structurally", () => {
    const html = renderToStaticMarkup(
      <SettingsLibraryServerPanel
        profile={{
          id: "profile-1",
          label: "Library",
          serverBaseUrl: "https://library.example",
          serverName: "Library",
          serverDescription: "<p>Server <strong>description</strong>.</p>",
          accessToken: "token",
          verifiedAt: "2026-09-05T00:00:00Z",
          createdAt: "2026-09-05T00:00:00Z",
        }}
        state={{ phase: "idle" }}
        busy={false}
        onConnect={noop}
        onCheckConnection={noop}
        onLogOut={noop}
        onSignOutLocally={noop}
        onRepairConnection={noop}
        onForgetLocally={noop}
        serverActionsAvailable
      />,
    );
    expect(html).toContain("<p>Server <strong>description</strong>.</p>");
  });
});
