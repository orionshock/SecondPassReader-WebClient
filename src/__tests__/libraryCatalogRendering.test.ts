import { describe, expect, it } from "vitest";
import type { LibraryBook } from "@secondpass/client";
import { getBookDescriptionText } from "../features/library/bookTextUtils";
import { formatBookPublishedDate, formatBookSeries, getBookMetaItems } from "../features/library/display/bookDisplayUtils";
import { findNextSeriesBook } from "../features/library/seriesUtils";

function book(input: Partial<LibraryBook> & Pick<LibraryBook, "id" | "title">): LibraryBook {
  return {
    sort_title: input.title,
    subtitle: null,
    authors: [],
    series: null,
    tags: [],
    language: null,
    publisher: null,
    published_year: null,
    published_month: null,
    published_day: null,
    published_date_precision: null,
    cover_url: null,
    file_format: null,
    ...input,
  };
}

describe("rebuilt catalog rendering helpers", () => {
  it("uses nested series index and list-safe metadata", () => {
    const row = book({
      id: "b1",
      title: "Book",
      language: "en",
      file_format: "epub",
      published_year: 2024,
      published_month: 3,
      series: { id: "s1", name: "Cycle", sort_name: "Cycle", series_index: 2 },
    });
    expect(formatBookSeries(row)).toBe("Cycle #2");
    expect(formatBookPublishedDate(row)).toBe("2024-03");
    expect(getBookMetaItems(row)).toEqual(["en", "2024-03", "epub"]);
  });

  it("reads descriptions only from book detail data", () => {
    expect(getBookDescriptionText({ description: "<p>Detail text</p>" })).toBe("Detail text");
    expect(getBookDescriptionText(undefined)).toBeUndefined();
  });

  it("finds the next series book without reordering the server page", () => {
    const current = book({ id: "b1", title: "One", series: { id: "s1", name: "S", sort_name: "S", series_index: 1 } });
    const third = book({ id: "b3", title: "Three", series: { id: "s1", name: "S", sort_name: "S", series_index: 3 } });
    const second = book({ id: "b2", title: "Two", series: { id: "s1", name: "S", sort_name: "S", series_index: 2 } });
    const page = [third, second];
    expect(findNextSeriesBook(current, page)?.id).toBe("b2");
    expect(page).toEqual([third, second]);
  });
});
