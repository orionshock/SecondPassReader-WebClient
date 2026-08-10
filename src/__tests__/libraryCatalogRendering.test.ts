import { describe, expect, it } from "vitest";
import type { CompactBook } from "@secondpass/client";
import { getBookDescriptionText } from "../features/library/BookDescription.Presenter";
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

  it("reads descriptions only from book detail data", () => {
    expect(getBookDescriptionText({ description: "<p>Detail text</p>" })).toBe("Detail text");
    expect(getBookDescriptionText(undefined)).toBeUndefined();
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
