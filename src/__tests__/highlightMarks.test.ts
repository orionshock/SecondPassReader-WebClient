import type { Rendition } from "@likecoin/epub-ts";
import { describe, expect, it, vi } from "vitest";

import { createHighlightMarkPainter } from "../features/reader/engine/highlightMarks";

describe("reader highlight mark painting", () => {
  it("repaints unchanged durable marks when renderer geometry changes", () => {
    const { painter, highlight, remove } = createHarness();
    painter.setHighlightMarks([{ id: "highlight-1", cfiRange: "epubcfi(/6/2,/1:0,/1:4)", color: "yellow" }]);

    painter.refresh();

    expect(remove).toHaveBeenCalledWith("epubcfi(/6/2,/1:0,/1:4)", "highlight");
    expect(highlight).toHaveBeenCalledTimes(2);
  });

  it("repaints temporary search marks when renderer geometry changes", () => {
    const { painter, highlight, remove } = createHarness();
    painter.setTemporarySearchHighlight("epubcfi(/6/4,/1:0,/1:4)");

    painter.refresh();

    expect(remove).toHaveBeenCalledWith("epubcfi(/6/4,/1:0,/1:4)", "highlight");
    expect(highlight).toHaveBeenCalledTimes(2);
  });

  it("paints pink marks with the visible application palette color", () => {
    const { painter, highlight } = createHarness();

    painter.setHighlightMarks([{ id: "highlight-1", cfiRange: "epubcfi(/6/2,/1:0,/1:4)", color: "pink" }]);

    expect(highlight.mock.calls[0]?.[4]).toMatchObject({
      fill: "#ec4899",
      "fill-opacity": "0.42",
      "background-color": "#ec4899",
    });
  });
});

function createHarness() {
  const highlight = vi.fn();
  const remove = vi.fn();
  const rendition = { annotations: { highlight, remove } } as unknown as Rendition;
  return {
    painter: createHighlightMarkPainter({ rendition }),
    highlight,
    remove,
  };
}
