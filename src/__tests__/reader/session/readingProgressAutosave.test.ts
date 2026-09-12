import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarginaliaProgress } from "@secondpass/client";
import { ApiError } from "@secondpass/client";
import {
  READING_PROGRESS_AUTOSAVE_DELAY_MS,
  ReadingProgressAutosaveController,
} from "../../../features/reader/session/progress/ReadingProgressAutosave.Controller";
import { buildReadingProgressSaveInput } from "../../../features/reader/session/progress/ReadingProgressAutosave.Lifecycle";

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
      toc: [{ id: "dedication", label: "Dedication", href: "The Blackstaff.xhtml" }],
      bookTitle: "The Blackstaff",
      location: {
        cfi: "epubcfi(/6/2)",
        sectionIndex: 7,
        sectionCount: 12,
        bookProgress: 0.01,
        displayedPage: 1,
        displayedTotal: 2,
        href: "The Blackstaff.xhtml",
      },
    })).toEqual({
      cfi: "epubcfi(/6/2)",
      locationLabel: "001% - Dedication",
    });
  });
});

describe("ReadingProgressAutosaveController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("preserves the three-second product debounce interval", async () => {
    const save = vi.fn(async (_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      savedProgress(progress.cfi, progress.locationLabel));
    const controller = new ReadingProgressAutosaveController(() => undefined);

    controller.update({
      enabled: true,
      autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
      sessionId: "session-1",
      progress: { cfi: "epubcfi(/6/2)", locationLabel: "Chapter 01 - 10%" },
      saveProgress: save,
    });

    await vi.advanceTimersByTimeAsync(READING_PROGRESS_AUTOSAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
  });

  it("treats opened progress and its identical initial relocation as already saved", async () => {
    const save = vi.fn(async (_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      savedProgress(progress.cfi, progress.locationLabel));
    const controller = new ReadingProgressAutosaveController(() => undefined);
    const openedProgress = savedProgress("epubcfi(/6/8)", "Chapter 04 - 40%");

    controller.update({
      enabled: true,
      autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
      sessionId: "session-1",
      progress: { cfi: openedProgress.cfi, locationLabel: openedProgress.locationLabel },
      saveProgress: save,
    });
    controller.seedSavedProgress("session-1", openedProgress);
    await vi.advanceTimersByTimeAsync(READING_PROGRESS_AUTOSAVE_DELAY_MS);

    expect(save).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ status: "saved", dirty: false, lastSavedCfi: openedProgress.cfi });
  });

  it("saves a different relocation after opened progress seeds the saved baseline", async () => {
    const save = vi.fn(async (_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      savedProgress(progress.cfi, progress.locationLabel));
    const controller = new ReadingProgressAutosaveController(() => undefined);
    const common = {
      enabled: true,
      autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
      sessionId: "session-1",
      saveProgress: save,
    };

    controller.update({ ...common, progress: { cfi: "epubcfi(/6/8)", locationLabel: "Chapter 04 - 40%" } });
    controller.seedSavedProgress("session-1", savedProgress("epubcfi(/6/8)", "Chapter 04 - 40%"));
    controller.update({ ...common, progress: { cfi: "epubcfi(/6/10)", locationLabel: "Chapter 05 - 50%" } });
    await vi.advanceTimersByTimeAsync(READING_PROGRESS_AUTOSAVE_DELAY_MS);

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("session-1", {
      cfi: "epubcfi(/6/10)",
      locationLabel: "Chapter 05 - 50%",
    });
  });

  it("does not carry a saved-progress seed into another session generation", async () => {
    const save = vi.fn(async (_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      savedProgress(progress.cfi, progress.locationLabel));
    const controller = new ReadingProgressAutosaveController(() => undefined);
    const payload = { cfi: "epubcfi(/6/8)", locationLabel: "Chapter 04 - 40%" };

    controller.update({ enabled: true, autosaveDelayMs: 10, sessionId: "session-1", progress: payload, saveProgress: save });
    controller.seedSavedProgress("session-1", savedProgress(payload.cfi, payload.locationLabel));
    controller.update({ enabled: true, autosaveDelayMs: 10, sessionId: "session-2", progress: payload, saveProgress: save });
    await vi.advanceTimersByTimeAsync(10);

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("session-2", payload);
  });

  it("does not exit-flush unchanged progress that was seeded from open", async () => {
    const save = vi.fn(async (_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      savedProgress(progress.cfi, progress.locationLabel));
    const controller = new ReadingProgressAutosaveController(() => undefined);
    const openedProgress = savedProgress("epubcfi(/6/8)", "Chapter 04 - 40%");

    controller.update({
      enabled: true,
      autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
      sessionId: "session-1",
      progress: { cfi: openedProgress.cfi, locationLabel: openedProgress.locationLabel },
      saveProgress: save,
    });
    controller.seedSavedProgress("session-1", openedProgress);
    await controller.flushNow({ silent: true });

    expect(save).not.toHaveBeenCalled();
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

  it("flushes the latest pending payload immediately and does not resend it once saved", async () => {
    const save = vi.fn(async (_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      savedProgress(progress.cfi, progress.locationLabel));
    const controller = new ReadingProgressAutosaveController(() => undefined);
    controller.update({
      enabled: true,
      autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
      sessionId: "session-1",
      progress: { cfi: "epubcfi(/6/8)", locationLabel: "Chapter 04 - 40%" },
      saveProgress: save,
    });

    await controller.flushNow();
    await controller.flushNow();

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("session-1", {
      cfi: "epubcfi(/6/8)",
      locationLabel: "Chapter 04 - 40%",
    });
  });

  it("flushes the newest complete payload instead of the originally scheduled payload", async () => {
    const save = vi.fn(async (_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      savedProgress(progress.cfi, progress.locationLabel));
    const controller = new ReadingProgressAutosaveController(() => undefined);
    const common = {
      enabled: true,
      autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
      sessionId: "session-1",
      saveProgress: save,
    };
    controller.update({
      ...common,
      progress: { cfi: "epubcfi(/6/2)", locationLabel: "Chapter 01 - 10%" },
    });
    controller.update({
      ...common,
      progress: { cfi: "epubcfi(/6/10)", locationLabel: "Chapter 05 - 50%" },
    });

    await controller.flushNow();

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("session-1", {
      cfi: "epubcfi(/6/10)",
      locationLabel: "Chapter 05 - 50%",
    });
  });

  it("does not flush without a session, save client, or complete progress", async () => {
    const save = vi.fn(async (_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      savedProgress(progress.cfi, progress.locationLabel));
    const inputs = [
      { sessionId: null, progress: { cfi: "epubcfi(/6/2)", locationLabel: "A" }, saveProgress: save },
      { sessionId: "session-1", progress: null, saveProgress: save },
      { sessionId: "session-1", progress: { cfi: "epubcfi(/6/2)", locationLabel: "A" }, saveProgress: null },
    ];

    for (const input of inputs) {
      const controller = new ReadingProgressAutosaveController(() => undefined);
      controller.update({
        enabled: true,
        autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
        ...input,
      });
      await controller.flushNow();
    }

    expect(save).not.toHaveBeenCalled();
  });

  it("reuses an in-flight drain and then flushes one newer payload", async () => {
    const firstSave = deferred<MarginaliaProgress>();
    const save = vi.fn((_sessionId: string, progress: { cfi: string; locationLabel: string }) =>
      progress.cfi.includes("/2") ? firstSave.promise : Promise.resolve(savedProgress(progress.cfi, progress.locationLabel)));
    const controller = new ReadingProgressAutosaveController(() => undefined);
    const common = {
      enabled: true,
      autosaveDelayMs: 10,
      sessionId: "session-1",
      saveProgress: save,
    };
    controller.update({
      ...common,
      progress: { cfi: "epubcfi(/6/2)", locationLabel: "Chapter 01 - 10%" },
    });
    await vi.advanceTimersByTimeAsync(10);
    controller.update({
      ...common,
      progress: { cfi: "epubcfi(/6/12)", locationLabel: "Chapter 06 - 60%" },
    });

    const flush = controller.flushNow();
    firstSave.resolve(savedProgress("epubcfi(/6/2)", "Chapter 01 - 10%"));
    await flush;

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]).toEqual([
      "session-1",
      { cfi: "epubcfi(/6/12)", locationLabel: "Chapter 06 - 60%" },
    ]);
  });

  it("isolates a rejected silent exit flush from post-unmount state notifications", async () => {
    const onStateChange = vi.fn();
    const controller = new ReadingProgressAutosaveController(onStateChange);
    controller.update({
      enabled: true,
      autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
      sessionId: "session-1",
      progress: { cfi: "epubcfi(/6/4)", locationLabel: "Chapter 02 - 20%" },
      saveProgress: vi.fn().mockRejectedValue(new Error("offline")),
    });
    onStateChange.mockClear();

    await expect(controller.flushNow({ silent: true })).resolves.toBeUndefined();

    expect(onStateChange).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ status: "error" });
  });

  it("treats a closed-session conflict as recoverable drift and blocks later writes for that session", async () => {
    const save = vi.fn().mockRejectedValue(new ApiError({
      kind: "http_error",
      status: 409,
      message: "SESSION_CLOSED",
    }));
    const controller = new ReadingProgressAutosaveController(() => undefined);
    const input = {
      enabled: true,
      autosaveDelayMs: 10,
      sessionId: "session-1",
      progress: { cfi: "epubcfi(/6/4)", locationLabel: "020% - Chapter 2" },
      saveProgress: save,
    };

    controller.update(input);
    await vi.advanceTimersByTimeAsync(10);
    controller.update({ ...input, progress: { cfi: "epubcfi(/6/6)", locationLabel: "030% - Chapter 3" } });
    await vi.advanceTimersByTimeAsync(10);

    expect(save).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({ status: "closed", dirty: false });
  });
});
