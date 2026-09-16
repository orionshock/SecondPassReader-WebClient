import { describe, expect, it, vi } from "vitest";
import type { ReaderCfiDisplayResult } from "../../../features/reader/domain/ReaderDomain.Types";
import type { EpubTsBookEngine } from "../../../features/reader/engine/EpubTsBook.Engine";
import {
  ReaderRuntimeController,
  ReaderRuntimeStaleGenerationError,
  type ReaderRuntimeReflowDependencies,
  type ReaderRuntimeReflowIntent,
} from "../../../features/reader/shell/ReaderRuntime.Controller";
import { normalizeReaderSettings } from "../../../storage/ReaderSettings.Store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("ReaderRuntimeController", () => {
  it("executes operations serially in enqueue order", async () => {
    const { controller } = runtimeHarness();
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
      run: async () => { calls.push("second"); },
    });

    expect(calls).toEqual(["first-start"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(calls).toEqual(["first-start", "first-end", "second"]);
  });

  it("does not start a second operation while the first is unresolved", async () => {
    const { controller } = runtimeHarness();
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
    const { controller } = runtimeHarness();
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
    const { controller } = runtimeHarness();
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

  it("owns protected-anchor, mark-refresh, and staged re-anchor ordering", async () => {
    const calls: string[] = [];
    const settings = normalizeReaderSettings({ theme: "sepia" });
    const { controller, engine } = runtimeHarness({
      getProtectedRestoreCfi: () => {
        calls.push("select-anchor");
        return "epubcfi(/6/4)";
      },
      runProtectedLayoutMutation: async (operation) => {
        calls.push("protect-staging");
        return operation();
      },
      reanchorStagedToolbar: async () => { calls.push("reanchor"); },
    }, {
      applyDisplaySettings: vi.fn(async () => { calls.push("apply-settings"); }),
      refreshHighlightMarks: vi.fn(() => { calls.push("refresh-marks"); }),
    });

    await controller.reflow({ type: "apply-settings", settings });

    expect(engine.applyDisplaySettings).toHaveBeenCalledWith(settings, {
      preserveCfi: "epubcfi(/6/4)",
    });
    expect(calls).toEqual([
      "protect-staging",
      "select-anchor",
      "apply-settings",
      "refresh-marks",
      "reanchor",
    ]);
  });

  it("preserves the protected anchor when resizing to the mount", async () => {
    const { controller, engine } = runtimeHarness({
      getProtectedRestoreCfi: () => "epubcfi(/6/10)",
    });

    await controller.reflow(resizeIntent());

    expect(engine.resizeToMount).toHaveBeenCalledWith({ preserveCfi: "epubcfi(/6/10)" });
  });

  it("keeps staged toolbar measurement failure recoverable", async () => {
    const { controller, engine } = runtimeHarness({
      reanchorStagedToolbar: async () => { throw new Error("range is not measurable"); },
    });

    await expect(controller.reflow(resizeIntent())).resolves.toBeUndefined();
    expect(engine.refreshHighlightMarks).toHaveBeenCalledOnce();
  });

  it("does not hide engine reflow or mark-refresh failures", async () => {
    const reflowError = new Error("reflow failed");
    const failedReflow = runtimeHarness({}, {
      resizeToMount: vi.fn(async () => { throw reflowError; }),
    });
    await expect(failedReflow.controller.reflow(resizeIntent())).rejects.toBe(reflowError);
    expect(failedReflow.engine.refreshHighlightMarks).not.toHaveBeenCalled();

    const refreshError = new Error("refresh failed");
    const failedRefresh = runtimeHarness({}, {
      refreshHighlightMarks: vi.fn(() => { throw refreshError; }),
    });
    await expect(failedRefresh.controller.reflow(resizeIntent())).rejects.toBe(refreshError);
  });

  it.each([
    { label: "resize", intent: resizeIntent() },
    { label: "settings", intent: settingsIntent() },
  ])("coalesces pending $label operations to the newest request", async ({ intent }) => {
    const calls: string[] = [];
    const { controller, engine } = runtimeHarness({}, {
      applyDisplaySettings: vi.fn(async (settings) => { calls.push(`settings-${settings.theme}`); }),
      resizeToMount: vi.fn(async () => { calls.push("resize"); }),
    });
    const gate = deferred<void>();
    const blocker = controller.run({ kind: "display", run: () => gate.promise });
    const older = controller.reflow(intent);
    const newerIntent: ReaderRuntimeReflowIntent = intent.type === "apply-settings"
      ? { type: "apply-settings", settings: normalizeReaderSettings({ theme: "dark" }) }
      : intent;
    const newer = controller.reflow(newerIntent);

    gate.resolve();
    await Promise.all([blocker, older, newer]);
    expect(engine.applyDisplaySettings.mock.calls.length + engine.resizeToMount.mock.calls.length).toBe(1);
    if (newerIntent.type === "apply-settings") expect(calls).toEqual(["settings-dark"]);
  });

  it("does not interrupt a running reflow when a newer one is enqueued", async () => {
    const firstGate = deferred<void>();
    const calls: string[] = [];
    const { controller } = runtimeHarness({}, {
      resizeToMount: vi.fn(async () => {
        const call = calls.length === 0 ? "first" : "second";
        calls.push(`${call}-start`);
        if (call === "first") await firstGate.promise;
        calls.push(`${call}-end`);
      }),
    });
    const first = controller.reflow(resizeIntent());
    const second = controller.reflow(resizeIntent());

    expect(calls).toEqual(["first-start"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(calls).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });

  it("does not interrupt a running layout-delayed resize when a newer resize is enqueued", async () => {
    const layoutGate = deferred<void>();
    const { controller, engine } = runtimeHarness({ waitForLayout: () => layoutGate.promise });
    const older = controller.reflow({ type: "resize-to-mount", timing: "after-layout" });
    const newer = controller.reflow(resizeIntent());

    layoutGate.resolve();
    await Promise.all([older, newer]);

    expect(engine.resizeToMount).toHaveBeenCalledTimes(2);
    expect(engine.refreshHighlightMarks).toHaveBeenCalledTimes(2);
  });

  it("abandons a layout-delayed resize whose trigger lifetime ended", async () => {
    const layoutGate = deferred<void>();
    let requested = true;
    const { controller, engine } = runtimeHarness({ waitForLayout: () => layoutGate.promise });
    const resize = controller.reflow({
      type: "resize-to-mount",
      timing: "after-layout",
      isRequested: () => requested,
    });

    requested = false;
    layoutGate.resolve();
    await resize;

    expect(engine.resizeToMount).not.toHaveBeenCalled();
    expect(engine.refreshHighlightMarks).not.toHaveBeenCalled();
  });

  it("does not coalesce reflows across an explicit display operation", async () => {
    const calls: string[] = [];
    const { controller } = runtimeHarness({}, {
      resizeToMount: vi.fn(async () => { calls.push("resize"); }),
    });
    const gate = deferred<void>();
    const blocker = controller.run({ kind: "display", run: () => gate.promise });
    const firstResize = controller.reflow(resizeIntent());
    const display = controller.run({ kind: "display", run: async () => { calls.push("display"); } });
    const secondResize = controller.reflow(resizeIntent());

    gate.resolve();
    await Promise.all([blocker, firstResize, display, secondResize]);
    expect(calls).toEqual(["resize", "display", "resize"]);
  });

  it("does not refresh marks or re-anchor after a stale generation completes", async () => {
    const gate = deferred<void>();
    const reanchor = vi.fn(async () => undefined);
    const { controller, engine } = runtimeHarness({ reanchorStagedToolbar: reanchor }, {
      resizeToMount: vi.fn(() => gate.promise),
    });
    const reflow = controller.reflow(resizeIntent());
    const result = expect(reflow).rejects.toBeInstanceOf(ReaderRuntimeStaleGenerationError);

    controller.detach(1);
    gate.resolve();
    await result;

    expect(engine.refreshHighlightMarks).not.toHaveBeenCalled();
    expect(reanchor).not.toHaveBeenCalled();
  });

  it("propagates ordinary operation failures without changing their error", async () => {
    const { controller } = runtimeHarness();
    const error = new Error("display failed");
    await expect(controller.run({
      kind: "display",
      run: async () => { throw error; },
    })).rejects.toBe(error);
  });
});

function runtimeHarness(
  dependencyOverrides: Partial<ReaderRuntimeReflowDependencies> = {},
  engineOverrides: Partial<EpubTsBookEngine> = {},
) {
  const dependencies: ReaderRuntimeReflowDependencies = {
    getProtectedRestoreCfi: () => null,
    runProtectedLayoutMutation: (operation) => operation(),
    reanchorStagedToolbar: async () => undefined,
    waitForLayout: async () => undefined,
    ...dependencyOverrides,
  };
  const engine = {
    applyDisplaySettings: vi.fn(async () => undefined),
    resizeToMount: vi.fn(async () => undefined),
    refreshHighlightMarks: vi.fn(),
    ...engineOverrides,
  } as unknown as EpubTsBookEngine & {
    applyDisplaySettings: ReturnType<typeof vi.fn>;
    resizeToMount: ReturnType<typeof vi.fn>;
    refreshHighlightMarks: ReturnType<typeof vi.fn>;
  };
  const controller = new ReaderRuntimeController(dependencies);
  controller.attach(engine, 1);
  return { controller, dependencies, engine };
}

function resizeIntent(): ReaderRuntimeReflowIntent {
  return { type: "resize-to-mount", timing: "current-layout" };
}

function settingsIntent(): ReaderRuntimeReflowIntent {
  return { type: "apply-settings", settings: normalizeReaderSettings({ theme: "sepia" }) };
}
