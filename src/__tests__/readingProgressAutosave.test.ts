import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarginaliaProgress } from "@secondpass/client";
import { ReadingProgressAutosaveController } from "../features/reader/session/ReadingProgressAutosave.Controller";
import { buildReadingProgressSaveInput } from "../features/reader/session/ReadingProgressAutosave.Lifecycle";

function savedProgress(cfi: string, locationLabel: string): MarginaliaProgress {
  return { cfi, locationLabel, updatedAt: "2026-08-08T00:00:00Z" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("reading progress autosave input", () => {
  it("sends the stable generated location label instead of rendered-page metadata", () => {
    expect(buildReadingProgressSaveInput({
      cfi: "epubcfi(/6/2)",
      sectionIndex: 7,
      sectionCount: 12,
      bookProgress: 0.42,
      displayedPage: 1,
      displayedTotal: 10,
      href: "The Blackstaff.xhtml",
    })).toEqual({
      cfi: "epubcfi(/6/2)",
      locationLabel: "Chapter 08 - 42%",
    });
  });
});

describe("ReadingProgressAutosaveController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("preserves the debounce interval", async () => {
    const save = vi.fn(async (_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      savedProgress(progress.cfi, progress.locationLabel));
    const controller = new ReadingProgressAutosaveController(() => undefined);

    controller.update({
      enabled: true,
      autosaveDelayMs: 5000,
      sessionId: "session-1",
      progress: { cfi: "epubcfi(/6/2)", locationLabel: "Chapter 01 - 10%" },
      saveProgress: save,
    });

    await vi.advanceTimersByTimeAsync(4999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
  });

  it("resets on session swap and ignores the old session timer", async () => {
    const save = vi.fn(async (_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      savedProgress(progress.cfi, progress.locationLabel));
    const controller = new ReadingProgressAutosaveController(() => undefined);

    controller.update({
      enabled: true,
      autosaveDelayMs: 5000,
      sessionId: "session-old",
      progress: { cfi: "epubcfi(/6/2)", locationLabel: "Old" },
      saveProgress: save,
    });
    await vi.advanceTimersByTimeAsync(2500);
    controller.update({
      enabled: true,
      autosaveDelayMs: 5000,
      sessionId: "session-new",
      progress: { cfi: "epubcfi(/6/4)", locationLabel: "New" },
      saveProgress: save,
    });

    expect(controller.getState().status).toBe("pending");
    expect(controller.getState().lastSavedCfi).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2500);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2500);
    expect(save).toHaveBeenCalledWith("session-new", { cfi: "epubcfi(/6/4)", locationLabel: "New" });
  });

  it("does not let an old session completion mark the new session saved", async () => {
    const oldSave = deferred<MarginaliaProgress>();
    const save = vi.fn((_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      progress.cfi.includes("/2") ? oldSave.promise : Promise.resolve(savedProgress(progress.cfi, progress.locationLabel)));
    const controller = new ReadingProgressAutosaveController(() => undefined);

    controller.update({
      enabled: true,
      autosaveDelayMs: 10,
      sessionId: "session-old",
      progress: { cfi: "epubcfi(/6/2)", locationLabel: "Old" },
      saveProgress: save,
    });
    await vi.advanceTimersByTimeAsync(10);
    controller.update({
      enabled: true,
      autosaveDelayMs: 10,
      sessionId: "session-new",
      progress: { cfi: "epubcfi(/6/4)", locationLabel: "New" },
      saveProgress: save,
    });
    oldSave.resolve(savedProgress("epubcfi(/6/2)", "Old"));
    await Promise.resolve();

    expect(controller.getState().status).toBe("pending");
    expect(controller.getState().lastSavedCfi).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10);
    expect(controller.getState()).toMatchObject({ status: "saved", lastSavedCfi: "epubcfi(/6/4)" });
  });

  it("drains the newest complete progress payload after an in-flight save", async () => {
    const firstSave = deferred<MarginaliaProgress>();
    const save = vi.fn((_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      progress.cfi.includes("/2") ? firstSave.promise : Promise.resolve(savedProgress(progress.cfi, progress.locationLabel)));
    const controller = new ReadingProgressAutosaveController(() => undefined);

    controller.update({
      enabled: true,
      autosaveDelayMs: 10,
      sessionId: "session-1",
      progress: { cfi: "epubcfi(/6/2)", locationLabel: "Chapter 01 - 10%" },
      saveProgress: save,
    });
    await vi.advanceTimersByTimeAsync(10);
    controller.update({
      enabled: true,
      autosaveDelayMs: 10,
      sessionId: "session-1",
      progress: { cfi: "epubcfi(/6/8)", locationLabel: "Chapter 04 - 40%" },
      saveProgress: save,
    });
    firstSave.resolve(savedProgress("epubcfi(/6/2)", "Chapter 01 - 10%"));
    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]).toEqual([
      "session-1",
      { cfi: "epubcfi(/6/8)", locationLabel: "Chapter 04 - 40%" },
    ]);
    expect(controller.getState()).toMatchObject({ status: "saved", lastSavedCfi: "epubcfi(/6/8)" });
  });

  it("does not save without a session, client, or complete progress", async () => {
    const save = vi.fn(async (_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      savedProgress(progress.cfi, progress.locationLabel));
    const controller = new ReadingProgressAutosaveController(() => undefined);
    const base = { enabled: true, autosaveDelayMs: 10, saveProgress: save };

    controller.update({ ...base, sessionId: null, progress: { cfi: "epubcfi(/6/2)", locationLabel: "A" } });
    controller.update({ ...base, sessionId: "session-1", progress: null });
    controller.update({
      ...base,
      sessionId: "session-1",
      progress: { cfi: "epubcfi(/6/2)", locationLabel: "A" },
      saveProgress: null,
    });
    await vi.runAllTimersAsync();

    expect(save).not.toHaveBeenCalled();
  });
});
