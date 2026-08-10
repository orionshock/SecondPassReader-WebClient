import { describe, expect, it } from "vitest";
import type { ReaderHighlightMark } from "../features/reader/domain/ReaderDomain.Types";
import {
  buildReadingSessionAnnotationToolbarItems,
  composeReadingSessionDurableMarks,
} from "../features/reader/session/ReadingSessionRender.Presenter";

describe("reading session render presentation", () => {
  it("keeps current marks before previous marks and preserves toolbar editability", () => {
    const current: ReaderHighlightMark = {
      id: "current-highlight",
      cfiRange: "epubcfi(/6/2,/1:0,/1:10)",
      text: "Current quote",
      note: "Current note",
      color: "yellow",
    };
    const previous: ReaderHighlightMark = {
      id: "previous-highlight",
      cfiRange: "epubcfi(/6/4,/1:0,/1:10)",
      text: "Previous quote",
      note: "Previous note",
      color: "blue",
      readOnly: true,
      sessionId: "previous-session",
    };
    const invalid: ReaderHighlightMark = { id: "", cfiRange: "", readOnly: true };

    const marks = composeReadingSessionDurableMarks([current, invalid], [previous]);

    expect(marks).toEqual([current, invalid, previous]);
    expect(buildReadingSessionAnnotationToolbarItems(marks)).toEqual([
      {
        id: "current-highlight",
        mode: "editable",
        quoteText: "Current quote",
        note: "Current note",
        color: "yellow",
      },
      {
        id: "previous-highlight",
        mode: "readonly",
        quoteText: "Previous quote",
        note: "Previous note",
        color: "blue",
      },
    ]);
  });
});
