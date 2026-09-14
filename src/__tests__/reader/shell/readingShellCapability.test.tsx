// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReaderRendererCapability } from "../../../features/reader/domain/ReaderBridge.Types";

const engineFactory = vi.hoisted(() => vi.fn());

vi.mock("../../../features/reader/engine/EpubTsBook.Engine", () => ({
  createEpubTsBookEngine: engineFactory,
}));

vi.mock("../../../features/reader/shell/ReaderMountResize.Lifecycle", () => ({
  observeReaderMountResize: () => () => undefined,
}));

import { ReadingShell } from "../../../features/reader/shell/ReadingShell.Orchestrator";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

describe("Reading Shell renderer capability", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    engineFactory.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("publishes only after readable display and withdraws the whole capability on replacement", async () => {
    const firstDisplay = deferred<void>();
    const secondDisplay = deferred<void>();
    const firstEngine = rendererEngine(firstDisplay.promise);
    const secondEngine = rendererEngine(secondDisplay.promise);
    engineFactory.mockResolvedValueOnce(firstEngine).mockResolvedValueOnce(secondEngine);
    const publications: Array<ReaderRendererCapability | null> = [];
    const onReady = (capability: ReaderRendererCapability | null) => publications.push(capability);

    await act(async () => root.render(
      <ReadingShell blob={new Blob(["first"])} onRendererCapabilityReady={onReady} />,
    ));
    await waitFor(() => engineFactory.mock.calls.length === 1);
    expect(publications.at(-1) ?? null).toBeNull();

    await act(async () => firstDisplay.resolve());
    await waitFor(() => publications.at(-1) !== null);
    const firstCapability = publications.at(-1)!;
    expect(firstCapability).toEqual(expect.objectContaining({
      describeCfi: expect.any(Function),
      probeCfi: expect.any(Function),
      displayCfi: expect.any(Function),
      searchBook: expect.any(Function),
      stagedSelection: expect.objectContaining({
        stageSelectionFromCfiRange: expect.any(Function),
      }),
    }));

    await act(async () => root.render(
      <ReadingShell blob={new Blob(["second"])} onRendererCapabilityReady={onReady} />,
    ));
    await waitFor(() => engineFactory.mock.calls.length === 2);
    expect(publications.at(-1)).toBeNull();
    await expect(firstCapability.searchBook("stale")).rejects.toThrow("not ready");

    await act(async () => secondDisplay.resolve());
    await waitFor(() => publications.at(-1) !== null);
    expect(publications.at(-1)).not.toBe(firstCapability);
    expect(firstEngine.destroy).toHaveBeenCalledOnce();
  });
});

function rendererEngine(display: Promise<void>) {
  return {
    display: vi.fn(() => display),
    destroy: vi.fn(),
    setHighlightMarks: vi.fn(),
    setTemporarySearchHighlight: vi.fn(),
    clearSelection: vi.fn(),
    describeCfi: vi.fn(async (cfi: string) => ({ cfi })),
    probeCfi: vi.fn(async () => ({ ok: true })),
    displayCfiSafely: vi.fn(async () => ({ ok: true })),
    searchBook: vi.fn(async () => []),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await act(async () => Promise.resolve());
  }
  throw new Error("Condition was not reached.");
}
