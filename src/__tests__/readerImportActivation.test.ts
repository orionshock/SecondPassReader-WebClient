import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useReaderImportActivation } from "../features/reader/imports/useReaderImportActivation";
import type { ReaderImportJob, ReaderImportRow } from "../features/reader/imports/readerImportTypes";
import type { ReaderSearchBookHandle } from "../features/reader/shell/types";
import type { StagedSelectionHandle } from "../features/reader/shell/stagedSelectionTypes";

describe("reader import activation orchestration", () => {
  it("stages a found highlight without accepting it", async () => {
    const harness = createHarness(row({ quoteText: "Found quote" }), {
      searchBook: async () => [searchResult("found-cfi", "Matched text")],
    });

    await harness.activate("row-1");

    expect(harness.stagedSelection.stageSelectionFromCfiRange).toHaveBeenCalledWith(expect.objectContaining({
      cfiRange: "found-cfi",
      text: "Matched text",
      source: { kind: "import", importJobId: "job-1", importRowId: "row-1" },
    }));
    expect(harness.setRowActivationState).toHaveBeenLastCalledWith("row-1", "staged", expect.objectContaining({ hasMatched: true }));
    expect(harness.onBookmarkSuggested).not.toHaveBeenCalled();
  });

  it("falls through from failed CFI staging to text search in one activation", async () => {
    const searchBook = vi.fn<ReaderSearchBookHandle>().mockResolvedValue([searchResult("fallback-cfi", "Fallback text")]);
    const harness = createHarness(row({
      quoteText: "Fallback quote",
      cfiHint: "epubcfi(/6/2!/4/2,/1:0,/1:4)",
    }), {
      probeCfi: async () => ({ ok: true, code: "exists-in-book", cfiKind: "point" }),
      searchBook,
    });

    await harness.activate("row-1");

    expect(searchBook).toHaveBeenCalled();
    expect(harness.stagedSelection.stageSelectionFromCfiRange).toHaveBeenLastCalledWith(expect.objectContaining({
      cfiRange: "fallback-cfi",
    }));
    expect(harness.setRowActivationState).toHaveBeenLastCalledWith("row-1", "staged", expect.objectContaining({
      attemptCursor: 2,
      hasMatched: true,
    }));
  });

  it("retains the text fallback cursor when failed CFI and text attempts find nothing", async () => {
    const harness = createHarness(row({
      quoteText: "Fallback quote",
      cfiHint: "epubcfi(/6/2!/4/2,/1:0,/1:4)",
    }), {
      probeCfi: async () => ({ ok: true, code: "exists-in-book", cfiKind: "point" }),
      searchBook: async () => [],
    });

    await harness.activate("row-1");

    expect(harness.setRowActivationState).toHaveBeenLastCalledWith("row-1", "not-found", expect.objectContaining({
      attemptCursor: 1,
      resultCursor: 0,
    }));
  });

  it("stages a sentence fragment when the full cross-block quote has no result", async () => {
    const quote = "A clear line of succession might lay many of these worries to rest.\u201d "
      + "Gaius nodded. \u201cI am addressing it. I will say no more than that.\u201d";
    const searchBook = vi.fn<ReaderSearchBookHandle>(async (query) => query === "I am addressing it"
      ? [searchResult("fragment-cfi", "\u201cI am addressing it.")]
      : []);
    const harness = createHarness(row({ quoteText: quote }), { searchBook });

    await harness.activate("row-1");

    expect(searchBook).toHaveBeenCalledWith(quote, expect.any(Object));
    expect(searchBook).toHaveBeenCalledWith("I am addressing it", expect.any(Object));
    expect(harness.stagedSelection.stageSelectionFromCfiRange).toHaveBeenLastCalledWith(expect.objectContaining({
      cfiRange: "fragment-cfi",
      text: "\u201cI am addressing it.",
    }));
    expect(harness.setRowActivationState).toHaveBeenLastCalledWith("row-1", "staged", expect.objectContaining({
      hasMatched: true,
    }));
  });

  it("runs text fallback when an unusable CFI has an exhausted cursor", async () => {
    const searchBook = vi.fn<ReaderSearchBookHandle>().mockResolvedValue([]);
    const harness = createHarness(row({
      status: "not-found",
      quoteText: "This is how it begins.",
      cfiHint: "2902",
      attemptCursor: 1,
    }), { searchBook });

    await harness.activate("row-1");

    expect(searchBook).toHaveBeenCalledWith("This is how it begins.", expect.any(Object));
  });

  it("stages an exact text fallback after normalizing an exhausted cursor", async () => {
    const searchBook = vi.fn<ReaderSearchBookHandle>().mockResolvedValue([
      searchResult("text-fallback-cfi", "This is how it begins."),
    ]);
    const harness = createHarness(row({
      status: "not-found",
      quoteText: "This is how it begins.",
      cfiHint: "2902",
      attemptCursor: 1,
    }), { searchBook });

    await harness.activate("row-1");

    expect(harness.stagedSelection.stageSelectionFromCfiRange).toHaveBeenCalledWith(expect.objectContaining({
      cfiRange: "text-fallback-cfi",
      text: "This is how it begins.",
    }));
    expect(harness.setRowActivationState).toHaveBeenLastCalledWith("row-1", "staged", expect.objectContaining({
      hasMatched: true,
    }));
  });

  it("ignores an older activation after a newer activation cancels it", async () => {
    let resolveFirst: ((value: ReturnType<typeof searchResult>[]) => void) | undefined;
    const first = new Promise<ReturnType<typeof searchResult>[]>((resolve) => { resolveFirst = resolve; });
    const searchBook = vi.fn<ReaderSearchBookHandle>()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce([]);
    const harness = createHarness(row({ quoteText: "Delayed quote" }), { searchBook });

    const activationA = harness.activate("row-1");
    const activationB = harness.activate("row-1");
    await activationB;
    const updatesAfterB = harness.setRowActivationState.mock.calls.length;
    resolveFirst?.([searchResult("stale-cfi", "Stale text")]);
    await activationA;

    expect(harness.setRowActivationState).toHaveBeenCalledTimes(updatesAfterB);
    expect(harness.stagedSelection.stageSelectionFromCfiRange).not.toHaveBeenCalled();
  });

  it("marks a row not-found when staging dependencies are unavailable", async () => {
    const harness = createHarness(row({ quoteText: "Found quote" }), { stagedSelection: null });

    await expect(harness.activate("row-1")).resolves.toBeUndefined();

    expect(harness.setRowActivationState).toHaveBeenCalledWith("row-1", "not-found", expect.objectContaining({
      attemptCursor: 0,
    }));
    expect(harness.setDrawerOpen).toHaveBeenCalledWith(true);
  });

  it("re-activates a staged CFI row at its text fallback", async () => {
    const probeCfi = vi.fn();
    const searchBook = vi.fn<ReaderSearchBookHandle>().mockResolvedValue([searchResult("text-cfi", "Text fallback")]);
    const harness = createHarness(row({
      status: "staged",
      quoteText: "Fallback quote",
      cfiHint: "epubcfi(/6/2!/4/2,/1:0,/1:4)",
      attemptCursor: 1,
      hasMatched: true,
    }), { probeCfi, searchBook });

    await harness.activate("row-1");

    expect(harness.stagedSelection.cancelStagedSelection).toHaveBeenCalledOnce();
    expect(probeCfi).not.toHaveBeenCalled();
    expect(searchBook).toHaveBeenCalled();
    expect(harness.stagedSelection.stageSelectionFromCfiRange).toHaveBeenLastCalledWith(expect.objectContaining({ cfiRange: "text-cfi" }));
  });
});

function createHarness(importRow: ReaderImportRow, overrides: {
  searchBook?: ReaderSearchBookHandle | null;
  probeCfi?: Parameters<typeof useReaderImportActivation>[0]["probeCfi"];
  stagedSelection?: StagedSelectionHandle | null;
} = {}) {
  const stagedSelection = overrides.stagedSelection === undefined ? {
    stageSelectionFromCfiRange: vi.fn(),
    cancelStagedSelection: vi.fn(),
  } : overrides.stagedSelection;
  const setRowActivationState = vi.fn();
  const setDrawerOpen = vi.fn();
  const onBookmarkSuggested = vi.fn();
  let activate: (rowId: string) => Promise<void> = async () => undefined;
  const job: ReaderImportJob = {
    id: "job-1", format: "test", fileName: "test.json", createdAt: "2026-01-01", rows: [importRow],
  };

  function Harness() {
    activate = useReaderImportActivation({
      job,
      searchBook: overrides.searchBook === undefined ? async () => [] : overrides.searchBook,
      probeCfi: overrides.probeCfi ?? null,
      displayCfi: null,
      stagedSelectionHandle: stagedSelection,
      selectRow: vi.fn(),
      setRowStatus: vi.fn(),
      setRowActivationState,
      setDrawerOpen,
      jumpToResult: vi.fn(),
      clearTemporaryHighlight: vi.fn(),
      onBookmarkSuggested,
    });
    return null;
  }
  renderToStaticMarkup(createElement(Harness));

  return { activate, stagedSelection: stagedSelection as StagedSelectionHandle, setRowActivationState, setDrawerOpen, onBookmarkSuggested };
}

function row(overrides: Partial<ReaderImportRow>): ReaderImportRow {
  return { id: "row-1", kind: "highlight", index: 1, status: "pending", ...overrides };
}

function searchResult(cfi: string, repairedText: string) {
  return { id: cfi, cfi, excerpt: repairedText, repairedText };
}
