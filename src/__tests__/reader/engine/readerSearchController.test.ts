import { describe, expect, it, vi } from "vitest";
import { ReaderSearchController } from "../../../features/reader/engine/ReaderSearch.Controller";
import type { ReaderSearchResult } from "../../../features/reader/domain/ReaderDomain.Types";

describe("ReaderSearchController", () => {
  it("runs EPUB search traversals serially", async () => {
    const controller = new ReaderSearchController();
    const firstGate = deferred<void>();
    const calls: string[] = [];
    const first = controller.search(async () => {
      calls.push("first-start");
      await firstGate.promise;
      calls.push("first-end");
      return [result("first")];
    });
    const second = controller.search(async () => {
      calls.push("second");
      return [result("second")];
    });

    expect(calls).toEqual(["first-start"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(calls).toEqual(["first-start", "first-end", "second"]);
  });

  it("continues draining after a search rejects", async () => {
    const controller = new ReaderSearchController();
    const failure = new Error("search failed");
    const nextRun = vi.fn(async () => [result("next")]);

    const failed = controller.search(async () => { throw failure; });
    const next = controller.search(nextRun);

    await expect(failed).rejects.toBe(failure);
    await expect(next).resolves.toEqual([result("next")]);
    expect(nextRun).toHaveBeenCalledOnce();
  });

  it("removes an aborted queued search without running it", async () => {
    const controller = new ReaderSearchController();
    const firstGate = deferred<void>();
    const first = controller.search(async () => {
      await firstGate.promise;
      return [];
    });
    const abort = new AbortController();
    const queuedRun = vi.fn(async () => [result("stale")]);
    const queued = controller.search(queuedRun, abort.signal);
    const queuedResult = expect(queued).rejects.toMatchObject({ name: "AbortError" });

    abort.abort();
    await queuedResult;
    expect(queuedRun).not.toHaveBeenCalled();
    firstGate.resolve();
    await first;
  });

  it("waits for an aborted running search to settle before starting the next traversal", async () => {
    const controller = new ReaderSearchController();
    const abort = new AbortController();
    const cleanupGate = deferred<void>();
    const nextRun = vi.fn(async () => [result("next")]);
    const running = controller.search(async () => {
      await cleanupGate.promise;
      if (abort.signal.aborted) throw new DOMException("Search cancelled.", "AbortError");
      return [];
    }, abort.signal);
    const runningResult = expect(running).rejects.toMatchObject({ name: "AbortError" });
    const next = controller.search(nextRun);

    abort.abort();
    await Promise.resolve();
    expect(nextRun).not.toHaveBeenCalled();
    cleanupGate.resolve();
    await runningResult;
    await expect(next).resolves.toEqual([result("next")]);
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function result(id: string): ReaderSearchResult {
  return { id, cfi: `cfi-${id}`, excerpt: id };
}
