import { describe, expect, it } from "vitest";

import { buildReaderImportAttemptQueue, getNextReaderImportAttempt } from "../../../features/reader/imports/ReaderImportAttempts.State";
import { readerImportRow as row } from "./ReaderImportTest.Fixtures";

describe("reader import attempts", () => {
  it("builds a text-search queue for text-only highlights", () => {
    expect(buildReaderImportAttemptQueue(row({ quoteText: "Selected text" }))).toEqual([
      { kind: "text-search", text: "Selected text" },
    ]);
  });

  it("does not enqueue CFI hints without a safe resolver", () => {
    expect(
      buildReaderImportAttemptQueue(
        row({
          quoteText: "Selected text",
          cfiHint: " epubcfi(/6/2) ",
        }),
      ),
    ).toEqual([
      { kind: "text-search", text: "Selected text" },
    ]);
  });

  it("keeps text fallback attempts for malformed CFI hints", () => {
    expect(buildReaderImportAttemptQueue(row({
      quoteText: "Selected text",
      cfiHint: "not-a-cfi",
    }))).toEqual([
      { kind: "text-search", text: "Selected text" },
    ]);
  });

  it("queues a highlight range CFI before text attempts", () => {
    expect(buildReaderImportAttemptQueue(row({ quoteText: "Selected text", cfiHint: "epubcfi(/6/2!/4/2,/1:0,/1:4)" }))).toEqual([
      { kind: "cfi-range", cfiRange: "epubcfi(/6/2!/4/2,/1:0,/1:4)" },
      { kind: "text-search", text: "Selected text" },
    ]);
  });

  it("orders quote hints before plain text search and preserves context", () => {
    expect(
      buildReaderImportAttemptQueue(
        row({
          quoteText: "Exact quote",
          preQuoteText: " before ",
          postQuoteText: " after ",
        }),
      ),
    ).toEqual([
      { kind: "quote-text", exact: "Exact quote", prefix: "before", suffix: "after" },
      { kind: "text-search", text: "Exact quote" },
    ]);
  });

  it("does not build quote/text activation attempts for bookmark rows", () => {
    expect(
      buildReaderImportAttemptQueue(
        row({
          kind: "bookmark",
          cfiHint: "epubcfi(/6/2)",
        }),
      ),
    ).toEqual([]);
  });

  it("returns the first attempt for a pending row", () => {
    expect(getNextReaderImportAttempt(row({ quoteText: "Selected text" }))).toMatchObject({
      attempt: { kind: "text-search", text: "Selected text" },
      cursor: 0,
      resultCursor: 0,
    });
  });

  it("advances staged and not-found rows by cursor", () => {
    const base = row({
      quoteText: "Selected text",
      attemptCursor: 1,
      preQuoteText: "before",
    });

    expect(getNextReaderImportAttempt({ ...base, status: "staged" })).toMatchObject({
      attempt: { kind: "text-search", text: "Selected text" },
      cursor: 1,
      resultCursor: 0,
    });
    expect(getNextReaderImportAttempt({ ...base, status: "not-found" })).toMatchObject({
      attempt: { kind: "text-search", text: "Selected text" },
      cursor: 1,
      resultCursor: 0,
    });
  });

  it("does not activate terminal or searching rows", () => {
    expect(getNextReaderImportAttempt(row({ status: "accepted" }))).toBeNull();
    expect(getNextReaderImportAttempt(row({ status: "skipped" }))).toBeNull();
    expect(getNextReaderImportAttempt(row({ status: "manually-completed" }))).toBeNull();
    expect(getNextReaderImportAttempt(row({ status: "searching" }))).toBeNull();
  });

  it("restarts an out-of-range cursor for a pending row", () => {
    expect(getNextReaderImportAttempt(row({ quoteText: "Selected text", attemptCursor: 1, resultCursor: 3 }))).toMatchObject({
      attempt: { kind: "text-search", text: "Selected text" },
      cursor: 0,
      resultCursor: 0,
    });
  });

  it("restarts an out-of-range cursor for a not-found row", () => {
    expect(getNextReaderImportAttempt(row({
      status: "not-found",
      quoteText: "Selected text",
      attemptCursor: 1,
      resultCursor: 2,
    }))).toMatchObject({
      attempt: { kind: "text-search", text: "Selected text" },
      cursor: 0,
      resultCursor: 0,
    });
  });

  it("cycles back to the first attempt when the row has matched before", () => {
    expect(
      getNextReaderImportAttempt(row({ status: "staged", quoteText: "Selected text", attemptCursor: 1, hasMatched: true })),
    ).toMatchObject({
      attempt: { kind: "text-search", text: "Selected text" },
      cursor: 0,
      resultCursor: 0,
    });
  });

  it("continues at text fallback after a failed CFI cursor", () => {
    expect(getNextReaderImportAttempt(row({
      status: "not-found",
      quoteText: "Selected text",
      cfiHint: "epubcfi(/6/2!/4/2,/1:0,/1:4)",
      attemptCursor: 1,
    }))).toMatchObject({
      attempt: { kind: "text-search", text: "Selected text" },
      cursor: 1,
    });
  });
});
