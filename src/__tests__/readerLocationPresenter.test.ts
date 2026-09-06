import { describe, expect, it } from "vitest";

import { buildReaderStatusLine, buildSavedReaderLocationLabel, findTocLabelForHref, getReaderLocationTocLabel } from "../features/reader/display/ReaderLocation.Presenter";
import type { ReaderTocItem } from "../features/reader/domain/ReaderDomain.Types";

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

describe("buildSavedReaderLocationLabel", () => {
  it("prefers a stable TOC label after padded progress", () => {
    expect(buildSavedReaderLocationLabel({
      toc: [{ id: "ch8", label: "Chapter 08", href: "text/chapter-eight.xhtml" }],
      bookTitle: "Sample Book",
      location: {
        cfi: "epubcfi(/6/16)",
        href: "text/chapter-eight.xhtml",
        sectionIndex: 7,
        bookProgress: 0.141,
        displayedPage: 1,
        displayedTotal: 2,
      },
    })).toBe("014% - Chapter 08");
  });

  it("uses the stable spine ordinal when no TOC label or boundary fallback applies", () => {
    expect(buildSavedReaderLocationLabel({
      toc: null,
      location: { sectionIndex: 7, sectionCount: 12, bookProgress: 0.14 },
    })).toBe("014% - Chapter 08");
  });

  it("sorts saved labels lexically by their padded progress prefix", () => {
    const labels = [
      buildSavedReaderLocationLabel({ toc: null, location: { bookProgress: 0.01 } }),
      buildSavedReaderLocationLabel({ toc: null, location: { sectionIndex: 7, sectionCount: 12, bookProgress: 0.14 } }),
      buildSavedReaderLocationLabel({ toc: null, location: { bookProgress: 0.99 } }),
    ];

    expect(labels).toEqual(["001% - Start", "014% - Chapter 08", "099% - End"]);
    expect([...labels].sort()).toEqual(labels);
  });
  it("uses semantic fallbacks near the start, near the end, and elsewhere", () => {
    expect(buildSavedReaderLocationLabel({ toc: null, location: { bookProgress: 0 } })).toBe("000% - Start");
    expect(buildSavedReaderLocationLabel({ toc: null, location: { bookProgress: 0.01 } })).toBe("001% - Start");
    expect(buildSavedReaderLocationLabel({ toc: null, location: { bookProgress: 0.99 } })).toBe("099% - End");
    expect(buildSavedReaderLocationLabel({ toc: null, location: { bookProgress: 1 } })).toBe("100% - End");
    expect(buildSavedReaderLocationLabel({ toc: null, location: { bookProgress: 0.42 } })).toBe("042% - Location");
    expect(buildSavedReaderLocationLabel({ toc: null, location: {} })).toBe("000% - Location");
  });

  it("does not persist rendition page fragments or machine-oriented location data", () => {
    const label = buildSavedReaderLocationLabel({
      toc: [{ id: "page", label: "p1/2", href: "OPS/Text/chapter.xhtml" }],
      location: {
        cfi: "epubcfi(/6/2)",
        href: "OPS/Text/chapter.xhtml",
        sectionIndex: 7,
        locationIndex: 12,
        bookProgress: 0.01,
        displayedPage: 1,
        displayedTotal: 2,
      },
    });

    expect(label).toBe("001% - Start");
    expect(label).not.toContain("p1/2");
    expect(label).not.toContain("chapter.xhtml");
    expect(label).not.toContain("epubcfi");
  });

  it("caps stored display metadata at the API field limit", () => {
    expect(buildSavedReaderLocationLabel({
      toc: [{ id: "long", label: "A".repeat(300), href: "long.xhtml" }],
      location: { href: "long.xhtml", bookProgress: 0.5 },
    }).length).toBe(255);
  });
});
