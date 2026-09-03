import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CompactBook } from "@secondpass/client";
import { BookDescription } from "../features/library/BookDescription.Presenter";
import { formatBookPublishedDate, formatBookSeries, getBookMetaItems } from "../features/library/display/BookDisplay.Presenter";
import { findNextSeriesBook } from "../features/library/SeriesMetadata.Presenter";

function book(input: Partial<CompactBook> & Pick<CompactBook, "id" | "title">): CompactBook {
  return {
    sortTitle: input.title,
    subtitle: "",
    authors: [],
    series: null,
    catalogTags: [],
    language: null,
    publisher: null,
    publishedYear: null,
    publishedMonth: null,
    publishedDay: null,
    publishedDatePrecision: "",
    coverUrl: null,
    fileFormat: "epub",
    ...input,
  };
}

describe("rebuilt catalog rendering helpers", () => {
  it("uses nested series index and list-safe metadata", () => {
    const row = book({
      id: "b1",
      title: "Book",
      language: "en",
      fileFormat: "epub",
      publishedYear: 2024,
      publishedMonth: 3,
      series: { id: "s1", name: "Cycle", sortName: "Cycle", seriesIndex: "2" },
    });
    expect(formatBookSeries(row)).toBe("Cycle #2");
    expect(formatBookPublishedDate(row)).toBe("2024-03");
    expect(getBookMetaItems(row)).toEqual(["en", "2024-03", "epub"]);
  });

  it("renders the server-sanitized book description as semantic limited HTML", () => {
    const html = renderToStaticMarkup(createElement(BookDescription, {
      description: "<p>A <b>first</b> paragraph with <em>emphasis</em>.<br>Next <i>line</i>.</p><ul><li>One item</li><li><strong>Another item</strong></li></ul><ol><li>First ordered item</li></ol>",
      expanded: false,
      id: "description",
    }));

    expect(html).toContain("<p>A <b>first</b> paragraph with <em>emphasis</em>.<br>Next <i>line</i>.</p>");
    expect(html).toContain("<ul><li>One item</li><li><strong>Another item</strong></li></ul>");
    expect(html).toContain("<ol><li>First ordered item</li></ol>");
    expect(html).not.toContain("&lt;p&gt;");
    expect(renderToStaticMarkup(createElement(BookDescription, {
      description: "   ",
      expanded: false,
      id: "empty-description",
    }))).toBe("");
  });

  it("finds the next series book without reordering the server page", () => {
    const current = book({ id: "b1", title: "One", series: { id: "s1", name: "S", sortName: "S", seriesIndex: "1" } });
    const third = book({ id: "b3", title: "Three", series: { id: "s1", name: "S", sortName: "S", seriesIndex: "3" } });
    const second = book({ id: "b2", title: "Two", series: { id: "s1", name: "S", sortName: "S", seriesIndex: "2" } });
    const page = [third, second];
    expect(findNextSeriesBook(current, page)?.id).toBe("b2");
    expect(page).toEqual([third, second]);
  });
});
