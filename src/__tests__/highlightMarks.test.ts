import type { Rendition } from "@likecoin/epub-ts";
import { describe, expect, it, vi } from "vitest";

import {
  createHighlightMarkPainter,
  reconcileHighlightMarksForRenderer,
} from "../features/reader/engine/highlightMarks";

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

  it("uses the staged preview as the sole renderer mark at an existing durable CFI", () => {
    const cfiRange = "epubcfi(/6/2,/1:0,/1:4)";
    const marks = reconcileHighlightMarksForRenderer([
      { id: "highlight-1", cfiRange, color: "yellow" },
      { id: "previous-highlight", cfiRange: "epubcfi(/6/4,/1:0,/1:4)", color: "blue", readOnly: true },
      { id: "__staged_selection__", cfiRange, color: "green" },
    ]);

    expect(marks).toEqual([
      { id: "previous-highlight", cfiRange: "epubcfi(/6/4,/1:0,/1:4)", color: "blue", readOnly: true },
      { id: "__staged_selection__", cfiRange, color: "green" },
    ]);
  });

  it("replaces an exact-CFI staged preview with one updated durable mark", () => {
    const cfiRange = "epubcfi(/6/2,/1:0,/1:4)";
    const { painter, highlight, remove } = createHarness();

    painter.setHighlightMarks([{ id: "highlight-1", cfiRange, color: "yellow" }]);
    painter.setHighlightMarks([
      { id: "highlight-1", cfiRange, color: "yellow" },
      { id: "__staged_selection__", cfiRange, color: "green" },
    ]);
    painter.setHighlightMarks([{ id: "highlight-1", cfiRange, color: "green" }]);

    expect(remove).toHaveBeenCalledTimes(2);
    expect(highlight).toHaveBeenCalledTimes(3);
    expect(highlight.mock.calls.map((call) => call[1])).toEqual([
      { id: "highlight-1" },
      { id: "__staged_selection__" },
      { id: "highlight-1" },
    ]);
    expect(highlight.mock.calls.at(-1)?.[4]).toMatchObject({ fill: "#22c55e" });
  });

  it("does not repaint an unchanged current-session mark additively", () => {
    const mark = { id: "highlight-1", cfiRange: "epubcfi(/6/2,/1:0,/1:4)", color: "green" };
    const { painter, highlight, remove } = createHarness();

    painter.setHighlightMarks([mark]);
    painter.setHighlightMarks([mark]);

    expect(highlight).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes a durable renderer mark when its annotation is deleted", () => {
    const cfiRange = "epubcfi(/6/2,/1:0,/1:4)";
    const { painter, remove } = createHarness();

    painter.setHighlightMarks([{ id: "highlight-1", cfiRange, color: "green" }]);
    painter.setHighlightMarks([]);

    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(cfiRange, "highlight");
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
