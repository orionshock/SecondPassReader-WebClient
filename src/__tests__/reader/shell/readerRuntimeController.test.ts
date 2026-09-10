import { describe, expect, it, vi } from "vitest";
import type { ReaderCfiDisplayResult } from "../../../features/reader/domain/ReaderDomain.Types";
import type { EpubTsBookEngine } from "../../../features/reader/engine/EpubTsBook.Engine";
import {
  ReaderRuntimeController,
  ReaderRuntimeStaleGenerationError,
  type ReaderRuntimeReflowKind,
} from "../../../features/reader/shell/ReaderRuntime.Controller";

const engine = {} as EpubTsBookEngine;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function attachedController(): ReaderRuntimeController {
  const controller = new ReaderRuntimeController();
  controller.attach(engine, 1);
  return controller;
}

describe("ReaderRuntimeController", () => {
  it("executes operations serially in enqueue order", async () => {
    const controller = attachedController();
    const firstGate = deferred<void>();
    const calls: string[] = [];
    const first = controller.run({
      kind: "display",
      run: async () => {
        calls.push("first-start");
        await firstGate.promise;
        calls.push("first-end");
      },
    });
    const second = controller.run({
      kind: "next",
      run: async () => {
        calls.push("second");
      },
    });

    expect(calls).toEqual(["first-start"]);
    firstGate.resolve();
    await Promise.all([first, second]);

    expect(calls).toEqual(["first-start", "first-end", "second"]);
  });

  it("does not start a second operation while the first is unresolved", async () => {
    const controller = attachedController();
    const gate = deferred<void>();
    const secondRun = vi.fn(async () => undefined);
    const first = controller.run({ kind: "display", run: () => gate.promise });
    const second = controller.run({ kind: "previous", run: secondRun });

    await Promise.resolve();
    expect(secondRun).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([first, second]);
    expect(secondRun).toHaveBeenCalledOnce();
  });

  it("suppresses stale follow-up work and pending operations after detach", async () => {
    const controller = attachedController();
    const gate = deferred<void>();
    const after = vi.fn(async () => undefined);
    const pendingRun = vi.fn(async () => undefined);
    const running = controller.run({ kind: "display", run: () => gate.promise, after });
    const pending = controller.run({ kind: "next", run: pendingRun });
    const runningResult = expect(running).rejects.toBeInstanceOf(ReaderRuntimeStaleGenerationError);
    const pendingResult = expect(pending).rejects.toBeInstanceOf(ReaderRuntimeStaleGenerationError);

    controller.detach(1);
    gate.resolve();
    await Promise.all([runningResult, pendingResult]);

    expect(after).not.toHaveBeenCalled();
    expect(pendingRun).not.toHaveBeenCalled();
  });

  it("serializes safe CFI display and preserves its typed result", async () => {
    const controller = attachedController();
    const gate = deferred<void>();
    const blocker = controller.run({ kind: "display", run: () => gate.promise });
    const expected: ReaderCfiDisplayResult = { ok: true, code: "displayed-approximate" };
    const safeDisplay = vi.fn(async () => expected);
    const resultPromise = controller.run({ kind: "safe-display", run: safeDisplay });

    expect(safeDisplay).not.toHaveBeenCalled();
    gate.resolve();
    await blocker;
    await expect(resultPromise).resolves.toBe(expected);
  });

  it("runs reflow, mark refresh, and toolbar re-anchor in order", async () => {
    const controller = attachedController();
    const calls: string[] = [];

    await controller.stabilizeReflow("settings", {
      reflow: async () => { calls.push("reflow"); },
      refreshMarks: () => { calls.push("refresh"); },
      reanchorStagedToolbar: async () => { calls.push("reanchor"); },
    });

    expect(calls).toEqual(["reflow", "refresh", "reanchor"]);
  });

  it.each<ReaderRuntimeReflowKind>(["resize", "settings"])(
    "coalesces pending %s operations to the newest request",
    async (kind) => {
      const controller = attachedController();
      const gate = deferred<void>();
      const blocker = controller.run({ kind: "display", run: () => gate.promise });
      const calls: string[] = [];
      const older = controller.stabilizeReflow(kind, {
        reflow: async () => { calls.push("older"); },
        refreshMarks: () => undefined,
        reanchorStagedToolbar: async () => undefined,
      });
      const newer = controller.stabilizeReflow(kind, {
        reflow: async () => { calls.push("newer"); },
        refreshMarks: () => undefined,
        reanchorStagedToolbar: async () => undefined,
      });

      gate.resolve();
      await Promise.all([blocker, older, newer]);
      expect(calls).toEqual(["newer"]);
    },
  );

  it("does not interrupt a running reflow when a newer one is enqueued", async () => {
    const controller = attachedController();
    const firstGate = deferred<void>();
    const calls: string[] = [];
    const first = controller.stabilizeReflow("resize", {
      reflow: async () => {
        calls.push("first-start");
        await firstGate.promise;
        calls.push("first-end");
      },
      refreshMarks: () => undefined,
      reanchorStagedToolbar: async () => undefined,
    });
    const second = controller.stabilizeReflow("resize", {
      reflow: async () => { calls.push("second"); },
      refreshMarks: () => undefined,
      reanchorStagedToolbar: async () => undefined,
    });

    expect(calls).toEqual(["first-start"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(calls).toEqual(["first-start", "first-end", "second"]);
  });

  it("does not coalesce reflows across an explicit display operation", async () => {
    const controller = attachedController();
    const gate = deferred<void>();
    const blocker = controller.run({ kind: "display", run: () => gate.promise });
    const calls: string[] = [];
    const firstResize = controller.stabilizeReflow("resize", {
      reflow: async () => { calls.push("first-resize"); },
      refreshMarks: () => undefined,
      reanchorStagedToolbar: async () => undefined,
    });
    const display = controller.run({
      kind: "display",
      run: async () => { calls.push("display"); },
    });
    const secondResize = controller.stabilizeReflow("resize", {
      reflow: async () => { calls.push("second-resize"); },
      refreshMarks: () => undefined,
      reanchorStagedToolbar: async () => undefined,
    });

    gate.resolve();
    await Promise.all([blocker, firstResize, display, secondResize]);
    expect(calls).toEqual(["first-resize", "display", "second-resize"]);
  });

  it("propagates operation failures without changing their error", async () => {
    const controller = attachedController();
    const error = new Error("display failed");

    await expect(controller.run({
      kind: "display",
      run: async () => { throw error; },
    })).rejects.toBe(error);
  });
});
