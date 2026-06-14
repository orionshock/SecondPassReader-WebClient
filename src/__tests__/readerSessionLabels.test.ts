import { describe, expect, it } from "vitest";

import { buildReaderStatusLine, findTocLabelForHref, getReaderLocationTocLabel } from "../features/reader/session/readerSessionLabels";
import type { ReaderTocItem } from "../features/reader/domain/types";

describe("buildReaderStatusLine", () => {
  const toc: ReaderTocItem[] = [
    { id: "title", label: "Title Page", href: "OPS/title.xhtml" },
    { id: "ch1", label: "Chapter 1 - Sample Book", href: "OPS/Text/chapter-1.xhtml#start" },
  ];

  it("formats TOC label, page, then percent", () => {
    expect(
      buildReaderStatusLine({
        toc,
        bookTitle: "Sample Book",
        location: {
          href: "Text/chapter-1.xhtml",
          displayedPage: 5,
          displayedTotal: 16,
          bookProgress: 0.032,
        },
      }),
    ).toEqual(["Chapter 1", "p5/16", "3%"]);
  });

  it("omits ugly href fallback when no TOC label matches", () => {
    expect(
      buildReaderStatusLine({
        toc,
        location: {
          href: "OPS/Text/ugly-file-name.xhtml",
          bookProgress: 0.2,
        },
      }),
    ).toEqual(["20%"]);
  });

  it("keeps page and percent fallbacks when there is no label", () => {
    expect(
      buildReaderStatusLine({
        toc: null,
        location: {
          displayedPage: 1,
          displayedTotal: 2,
          bookProgress: 0,
        },
      }),
    ).toEqual(["p1/2", "0%"]);
  });

  it("matches split spine hrefs back to their TOC chapter", () => {
    expect(
      buildReaderStatusLine({
        toc: [
          { id: "ch7", label: "Chapter 7", href: "text/part0007.html" },
          { id: "ch10", label: "Chapter 10", href: "text/part0010.xhtml" },
        ],
        location: {
          href: "text/part0007_split_001.html",
          bookProgress: 0.0839,
        },
      }),
    ).toEqual(["Chapter 7", "8%"]);
  });

  it("matches split spine hrefs across html and xhtml extensions", () => {
    expect(
      buildReaderStatusLine({
        toc: [{ id: "ch10", label: "Chapter 10", href: "text/part0010.xhtml" }],
        location: {
          href: "text/part0010_split_001.html",
          bookProgress: 0.1739,
        },
      }),
    ).toEqual(["Chapter 10", "17%"]);
  });

  it("matches split spine hrefs directly against unsplit html TOC hrefs", () => {
    expect(
      findTocLabelForHref(
        [{ id: "ch7", label: "Chapter 7", href: "text/part0007.html" }],
        "text/part0007_split_001.html",
      ),
    ).toBe("Chapter 7");
  });

  it("matches split spine hrefs directly against unsplit xhtml TOC hrefs", () => {
    expect(
      findTocLabelForHref(
        [{ id: "ch7", label: "Chapter 7", href: "text/part0007.xhtml" }],
        "text/part0007_split_001.html",
      ),
    ).toBe("Chapter 7");
  });

  it("matches suffix paths and basenames", () => {
    expect(
      findTocLabelForHref(
        [{ id: "ch1", label: "Chapter 1", href: "OPS/Text/chapter-1.xhtml" }],
        "Text/chapter-1.xhtml",
      ),
    ).toBe("Chapter 1");

    expect(
      findTocLabelForHref(
        [{ id: "ch2", label: "Chapter 2", href: "OPS/Text/chapter-2.xhtml" }],
        "chapter-2.xhtml",
      ),
    ).toBe("Chapter 2");
  });

  it("suppresses book-title-only labels", () => {
    expect(
      getReaderLocationTocLabel({
        toc: [{ id: "book", label: "Sample Book", href: "text/title.xhtml" }],
        href: "text/title.xhtml",
        bookTitle: "Sample Book",
      }),
    ).toBeNull();
  });

  it("strips redundant book title suffixes from chapter labels", () => {
    expect(
      getReaderLocationTocLabel({
        toc: [{ id: "ch1", label: "Chapter 1 - Sample Book", href: "text/chapter-1.xhtml" }],
        href: "text/chapter-1.xhtml",
        bookTitle: "Sample Book",
      }),
    ).toBe("Chapter 1");
  });
});
