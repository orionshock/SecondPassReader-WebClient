// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReaderActivityImportController } from "../../../features/reader/activity/ReaderActivityImport.Controller";
import type { ReaderActivityRenderState } from "../../../features/reader/activity/ReaderActivity.Types";
import type { useReaderImportJob } from "../../../features/reader/imports/ReaderImportJob.Controller";
import type { ReaderImportJob } from "../../../features/reader/imports/ReaderImport.Types";
import { ReaderImportReviewLifetime } from "../../../features/reader/imports/ReaderImportReview.Lifecycle";

describe("reader activity import lifetime", () => {
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement("div"));
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it.each([
    ["close", (controller: Controller) => controller.closeDrawer()],
    ["clear", (controller: Controller) => controller.clearJob()],
    ["skip", (controller: Controller) => controller.skipRow("row-1")],
    ["manual completion", (controller: Controller) => controller.markRowManuallyCompleted("row-1")],
  ])("invalidates pending search before %s cleanup", async (_name, exit) => {
    const harness = await mountHarness(root);
    const activation = harness.controller.activateRow("row-1");

    exit(harness.controller);

    expect(harness.signal?.aborted).toBe(true);
    harness.resolveSearch([searchResult("stale-cfi")]);
    await activation;
    expect(harness.displayCfi).not.toHaveBeenCalled();
    expect(harness.stageSelection).not.toHaveBeenCalled();
    expect(harness.setRowActivationState).not.toHaveBeenCalled();
    expect(harness.setDrawerOpen).not.toHaveBeenCalledWith(true);
  });

  it("invalidates a pending old-job activation before starting a replacement with a reused row ID", async () => {
    const harness = await mountHarness(root);
    const activation = harness.controller.activateRow("row-1");

    await harness.controller.startImport("test", new File(["replacement"], "replacement.json"));
    harness.resolveSearch([searchResult("job-a-cfi")]);
    await activation;

    expect(harness.startImport).toHaveBeenCalledOnce();
    expect(harness.displayCfi).not.toHaveBeenCalled();
    expect(harness.stageSelection).not.toHaveBeenCalled();
    expect(harness.setRowActivationState).not.toHaveBeenCalled();
    expect(harness.setDrawerOpen).not.toHaveBeenCalledWith(true);
  });

  it("publishes nothing after Reader teardown", async () => {
    const harness = await mountHarness(root);
    const activation = harness.controller.activateRow("row-1");

    act(() => root.unmount());
    harness.resolveSearch([searchResult("stale-cfi")]);
    await activation;

    expect(harness.signal?.aborted).toBe(true);
    expect(harness.displayCfi).not.toHaveBeenCalled();
    expect(harness.stageSelection).not.toHaveBeenCalled();
  });

  it("delegates drawer layout settling to one semantic runtime resize", async () => {
    const harness = await mountHarness(root);

    await harness.setDrawerLayout(false);

    expect(harness.sendCommand).toHaveBeenCalledOnce();
    expect(harness.sendCommand).toHaveBeenCalledWith({ type: "resize" });
  });
});

type Controller = ReturnType<typeof useReaderActivityImportController>;

async function mountHarness(root: Root) {
  let controller: Controller | null = null;
  let signal: AbortSignal | null = null;
  let resolveSearch: (results: ReturnType<typeof searchResult>[]) => void = () => undefined;
  const search = new Promise<ReturnType<typeof searchResult>[]>((resolve) => { resolveSearch = resolve; });
  const displayCfi = vi.fn(async () => ({ ok: true as const, code: "displayed" as const }));
  const stageSelection = vi.fn(async () => undefined);
  const setRowActivationState = vi.fn();
  const setDrawerOpen = vi.fn();
  const startImport = vi.fn(async () => job("job-b"));
  const reviewLifetime = new ReaderImportReviewLifetime();
  const readerImport = {
    job: job("job-a"),
    drawerOpen: true,
    bookmarkSuggestion: null,
    reviewLifetime,
    selectRow: vi.fn(),
    setRowStatus: vi.fn(),
    setRowActivationState,
    setDrawerOpen,
    suggestBookmark: vi.fn(),
    acceptBookmarkSuggestion: vi.fn(),
    clearJob: vi.fn(),
    skipRow: vi.fn(),
    markRowManuallyCompleted: vi.fn(),
    startImport,
  } as unknown as ReturnType<typeof useReaderImportJob>;
  const sendCommand = vi.fn();
  const renderer = {
    capability: {
      searchBook: (_query: string, options?: { signal?: AbortSignal }) => {
        signal = options?.signal ?? null;
        return search;
      },
      probeCfi: vi.fn(),
      displayCfi,
      stagedSelection: {
        stageSelectionFromCfiRange: stageSelection,
        runStagingTransaction: <T,>(operation: () => Promise<T>) => operation(),
        cancelStagedSelection: vi.fn(),
      },
    },
    clearTemporaryHighlight: vi.fn(),
    sendCommand,
  } as unknown as ReaderActivityRenderState["renderer"];

  function Harness() {
    controller = useReaderActivityImportController({ readerImport, renderer, annotations: null });
    return null;
  }

  await act(async () => root.render(<Harness />));
  if (!controller) throw new Error("Import controller did not mount.");
  const mountedController = controller as Controller;
  return {
    controller: mountedController,
    displayCfi,
    stageSelection,
    setRowActivationState,
    setDrawerOpen,
    startImport,
    sendCommand,
    setDrawerLayout: async (open: boolean) => {
      readerImport.drawerOpen = open;
      await act(async () => root.render(<Harness />));
    },
    get signal() { return signal; },
    resolveSearch,
  };
}

function job(id: string): ReaderImportJob {
  return {
    id,
    format: "test",
    fileName: `${id}.json`,
    createdAt: "2026-01-01T00:00:00.000Z",
    rows: [{ id: "row-1", kind: "highlight", index: 1, quoteText: "Delayed quote", status: "pending" }],
  };
}

function searchResult(cfi: string) {
  return { id: cfi, cfi, excerpt: "Matched text", repairedText: "Matched text" };
}
