import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useReaderImportActivation } from "../../../features/reader/imports/ReaderImportActivation.Controller";
import type { ReaderImportJob, ReaderImportRow } from "../../../features/reader/imports/ReaderImport.Types";
import type { ReaderSearchBookHandle, StagedSelectionHandle } from "../../../features/reader/domain/ReaderBridge.Types";
import { ReaderImportReviewLifetime } from "../../../features/reader/imports/ReaderImportReview.Lifecycle";

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

  it("awaits candidate display before programmatic staging", async () => {
    const order: string[] = [];
    const displayCfi = vi.fn(async () => {
      order.push("display-complete");
      return { ok: true as const, code: "displayed" as const };
    });
    const stagedSelection: StagedSelectionHandle = {
      stageSelectionFromCfiRange: vi.fn(async () => { order.push("stage"); }),
      runStagingTransaction: (operation) => operation(),
      cancelStagedSelection: vi.fn(),
    };
    const harness = createHarness(row({ quoteText: "Found quote" }), {
      searchBook: async () => [searchResult("found-cfi", "Matched text")],
      displayCfi,
      stagedSelection,
    });

    await harness.activate("row-1");

    expect(displayCfi).toHaveBeenCalledWith("found-cfi", { navigationIntent: "import-staging" });
    expect(order).toEqual(["display-complete", "stage"]);
  });

  it("stores the staged position for multiple cycleable candidates", async () => {
    const results = [
      searchResult("first-cfi", "First match"),
      searchResult("second-cfi", "Second match"),
      searchResult("third-cfi", "Third match"),
    ];
    const harness = createHarness(row({ quoteText: "Found quote" }), { searchBook: async () => results });

    await harness.activate("row-1");

    expect(harness.setRowActivationState).toHaveBeenLastCalledWith("row-1", "staged", expect.objectContaining({
      candidateIndex: 1,
      candidateCount: 3,
    }));
  });

  it("updates the staged position when cycling to another candidate", async () => {
    const results = [
      searchResult("first-cfi", "First match"),
      searchResult("second-cfi", "Second match"),
      searchResult("third-cfi", "Third match"),
    ];
    const harness = createHarness(row({
      status: "staged",
      quoteText: "Found quote",
      attemptCursor: 0,
      resultCursor: 2,
      hasMatched: true,
      candidateIndex: 2,
      candidateCount: 3,
    }), { searchBook: async () => results });

    await harness.activate("row-1");

    expect(harness.setRowActivationState).toHaveBeenLastCalledWith("row-1", "staged", expect.objectContaining({
      candidateIndex: 3,
      candidateCount: 3,
    }));
  });

  it("does not store candidate position for a single match", async () => {
    const harness = createHarness(row({ quoteText: "Found quote" }), {
      searchBook: async () => [searchResult("only-cfi", "Only match")],
    });

    await harness.activate("row-1");

    const activation = harness.setRowActivationState.mock.calls.at(-1)?.[2];
    expect(activation).not.toHaveProperty("candidateIndex");
    expect(activation).not.toHaveProperty("candidateCount");
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

  it("stages a repaired match found through a punctuation-light fragment", async () => {
    const quote = "\u201cIt is too late to save them,\u201d Doroga rumbled. \u201cThis is how it begins.\u201d";
    const searchBook = vi.fn<ReaderSearchBookHandle>(async (query) => query === "Doroga rumbled"
      ? [
          {
            id: "wrong-cfi",
            cfi: "wrong-cfi",
            excerpt: "Doroga rumbled",
            quotePrefix: "unrelated words",
            quoteSuffix: "another sentence",
          },
          {
            ...searchResult("punctuation-light-cfi", "Doroga rumbled."),
            quotePrefix: "Earlier text: \"It is too late to save them,\"",
            quoteSuffix: ". \"This is how it begins.\" Later text.",
          },
        ]
      : []);
    const harness = createHarness(row({ quoteText: quote }), { searchBook });

    await harness.activate("row-1");

    expect(searchBook).toHaveBeenCalledWith("Doroga rumbled", expect.objectContaining({
      repairFullText: "\u201cIt is too late to save them,\u201d Doroga rumbled.",
    }));
    expect(harness.stagedSelection.stageSelectionFromCfiRange).toHaveBeenLastCalledWith(expect.objectContaining({
      cfiRange: "punctuation-light-cfi",
      text: "Doroga rumbled.",
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

  it("publishes nothing when the review invalidates a pending text search", async () => {
    let resolveSearch: ((value: ReturnType<typeof searchResult>[]) => void) | undefined;
    const search = new Promise<ReturnType<typeof searchResult>[]>((resolve) => { resolveSearch = resolve; });
    const displayCfi = vi.fn(async () => ({ ok: true as const, code: "displayed" as const }));
    const harness = createHarness(row({ quoteText: "Delayed quote" }), {
      searchBook: () => search,
      displayCfi,
    });

    const activation = harness.activate("row-1");
    harness.invalidate();
    resolveSearch?.([searchResult("stale-cfi", "Stale text")]);
    await activation;

    expect(displayCfi).not.toHaveBeenCalled();
    expect(harness.stagedSelection.stageSelectionFromCfiRange).not.toHaveBeenCalled();
    expect(harness.setRowActivationState).not.toHaveBeenCalled();
    expect(harness.setDrawerOpen).not.toHaveBeenCalled();
  });

  it("does not publish or reopen review when bookmark display finishes after exit", async () => {
    let resolveDisplay: ((value: { ok: true; code: "displayed" }) => void) | undefined;
    const display = new Promise<{ ok: true; code: "displayed" }>((resolve) => { resolveDisplay = resolve; });
    const harness = createHarness(row({ kind: "bookmark", cfiHint: "epubcfi(/6/2)" }), {
      probeCfi: async () => ({ ok: true, code: "exists-in-book" }),
      displayCfi: () => display,
    });

    const activation = harness.activate("row-1");
    await vi.waitFor(() => expect(resolveDisplay).toBeTypeOf("function"));
    harness.invalidate();
    resolveDisplay?.({ ok: true, code: "displayed" });
    await activation;

    expect(harness.setRowActivationState).not.toHaveBeenCalled();
    expect(harness.onBookmarkSuggested).not.toHaveBeenCalled();
    expect(harness.setDrawerOpen).not.toHaveBeenCalled();
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
  displayCfi?: Parameters<typeof useReaderImportActivation>[0]["displayCfi"];
  stagedSelection?: StagedSelectionHandle | null;
} = {}) {
  const stagedSelection = overrides.stagedSelection === undefined ? {
    stageSelectionFromCfiRange: vi.fn(async () => undefined),
    runStagingTransaction: <T,>(operation: () => Promise<T>) => operation(),
    cancelStagedSelection: vi.fn(),
  } : overrides.stagedSelection;
  const setRowActivationState = vi.fn();
  const setDrawerOpen = vi.fn();
  const onBookmarkSuggested = vi.fn();
  let activate: (rowId: string) => Promise<void> = async () => undefined;
  let invalidate: () => void = () => undefined;
  const job: ReaderImportJob = {
    id: "job-1", format: "test", fileName: "test.json", createdAt: "2026-01-01", rows: [importRow],
  };

  function Harness() {
    const activation = useReaderImportActivation({
      job,
      reviewOpen: true,
      lifetime: new ReaderImportReviewLifetime(),
      searchBook: overrides.searchBook === undefined ? async () => [] : overrides.searchBook,
      probeCfi: overrides.probeCfi ?? null,
      displayCfi: overrides.displayCfi ?? (async () => ({ ok: true, code: "displayed" })),
      stagedSelectionHandle: stagedSelection,
      selectRow: vi.fn(),
      setRowStatus: vi.fn(),
      setRowActivationState,
      setDrawerOpen,
      clearTemporaryHighlight: vi.fn(),
      onBookmarkSuggested,
    });
    activate = activation.activateRow;
    invalidate = activation.invalidate;
    return null;
  }
  renderToStaticMarkup(createElement(Harness));

  return { activate, invalidate, stagedSelection: stagedSelection as StagedSelectionHandle, setRowActivationState, setDrawerOpen, onBookmarkSuggested };
}

function row(overrides: Partial<ReaderImportRow>): ReaderImportRow {
  return { id: "row-1", kind: "highlight", index: 1, status: "pending", ...overrides };
}

function searchResult(cfi: string, repairedText: string) {
  return { id: cfi, cfi, excerpt: repairedText, repairedText };
}
