import { describe, expect, it, vi } from "vitest";
import {
  startOfflineReaderRetrySchedulerLifecycle,
  type OfflineReaderRetrySchedulerDependencies,
} from "../app/offline/OfflineReaderRetryScheduler.Lifecycle";
import type { ReaderOutboxIntent, ReplaceReaderProgressIntent } from "../app/offline/ReaderOutbox.Policy";
import { createOfflineReaderSyncOutcome } from "../app/offline/OfflineReaderSyncOutcome.State";
import type { OfflineReaderSyncClient } from "../app/offline/OfflineReaderSync.Actions";
import type { ReaderOutboxRepository } from "../app/offline/OfflineRepositories.Types";

describe("offline Reader retry scheduler", () => {
  it("keeps one timer and replaces it when durable state moves earlier or later", async () => {
    const harness = schedulerHarness([deferredProgress(5_000)]);
    const stop = harness.start();
    await harness.waitForTimer(4_000);

    harness.setIntents([deferredProgress(3_000)]);
    harness.publishOutboxChange("account-a");
    await harness.waitForTimer(2_000);
    expect(harness.clearTimer).toHaveBeenCalled();

    harness.setIntents([deferredProgress(8_000)]);
    harness.publishOutboxChange("account-a");
    await harness.waitForTimer(7_000);
    expect(harness.activeTimerCount()).toBe(1);
    stop();
    expect(harness.activeTimerCount()).toBe(0);
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it("fires one automatic coordinated sweep while online and recalculates afterward", async () => {
    const harness = schedulerHarness([deferredProgress(2_000)]);
    const onCompleted = vi.fn();
    harness.syncPending.mockImplementation(async (input) => {
      harness.setIntents([]);
      const result = completed();
      input.onCompleted?.(result);
      return result;
    });
    const stop = harness.start(onCompleted);
    await harness.waitForTimer(1_000);

    harness.setNow(2_000);
    harness.fireTimer();
    await vi.waitFor(() => expect(harness.syncPending).toHaveBeenCalledOnce());

    expect(harness.syncPending).toHaveBeenCalledWith(expect.objectContaining({
      namespaceKey: "account-a",
      mode: "if-available",
      attemptMode: "automatic",
    }));
    expect(onCompleted).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(harness.activeTimerCount()).toBe(0));
    stop();
  });

  it("does not deliver while offline or unknown and rescans when online", async () => {
    const harness = schedulerHarness([deferredProgress(2_000)]);
    const stop = harness.start();
    await harness.waitForTimer(1_000);
    harness.setNow(2_000);
    harness.setConnectivity("offline");
    harness.fireConnectivity();
    expect(harness.activeTimerCount()).toBe(0);
    expect(harness.syncPending).not.toHaveBeenCalled();

    harness.setConnectivity("unknown");
    harness.fireConnectivity();
    expect(harness.syncPending).not.toHaveBeenCalled();

    harness.setConnectivity("online");
    harness.fireConnectivity();
    await vi.waitFor(() => expect(harness.syncPending).toHaveBeenCalledOnce());
    stop();
  });

  it("rescans overdue work on visibility and defers unchanged busy work without spinning", async () => {
    const harness = schedulerHarness([deferredProgress(1_000)], { now: 2_000, visible: false });
    harness.syncPending.mockResolvedValue(completed({ busyBooks: 1 }));
    const stop = harness.start();
    await vi.waitFor(() => expect(harness.syncPending).toHaveBeenCalledOnce());
    await harness.waitForTimer(30_000);
    expect(harness.syncPending).toHaveBeenCalledOnce();

    harness.setVisible(true);
    harness.fireVisibility();
    await harness.waitForTimer(30_000);
    expect(harness.syncPending).toHaveBeenCalledOnce();
    stop();
  });

  it("normalizes scan failure and disposal prevents late work", async () => {
    const harness = schedulerHarness([]);
    harness.list.mockRejectedValueOnce(new Error("raw IndexedDB failure https://secret.invalid"));
    const stop = harness.start();
    await vi.waitFor(() => expect(harness.reportFailure).toHaveBeenCalledWith("scan-outbox"));
    stop();
    harness.publishOutboxChange("account-a");
    harness.fireConnectivity();
    expect(harness.syncPending).not.toHaveBeenCalled();
    expect(JSON.stringify(harness.reportFailure.mock.calls)).not.toContain("secret.invalid");
  });
});

function schedulerHarness(
  initialIntents: ReaderOutboxIntent[],
  options: { now?: number; visible?: boolean } = {},
) {
  let intents = initialIntents;
  let now = options.now ?? 1_000;
  let connectivity: "online" | "offline" | "unknown" = "online";
  let visible = options.visible ?? true;
  let connectivityListener: () => void = () => undefined;
  let outboxListener: (namespaceKey: string) => void = () => undefined;
  let visibilityListener: () => void = () => undefined;
  let nextTimer = 1;
  const timers = new Map<number, { callback(): void; delay: number }>();
  const list = vi.fn(async () => structuredClone(intents));
  const readerOutbox = { list } as unknown as ReaderOutboxRepository;
  const close = vi.fn();
  const clearTimer = vi.fn((timer: ReturnType<typeof setTimeout>) => timers.delete(timer as unknown as number));
  const setTimer = vi.fn((callback: () => void, delay: number) => {
    const id = nextTimer;
    nextTimer += 1;
    timers.set(id, { callback, delay });
    return id as unknown as ReturnType<typeof setTimeout>;
  });
  const syncPending = vi.fn<OfflineReaderRetrySchedulerDependencies["syncPending"]>(async () => completed());
  const reportFailure = vi.fn<OfflineReaderRetrySchedulerDependencies["reportFailure"]>();
  const dependencies: OfflineReaderRetrySchedulerDependencies = {
    openRepositories: vi.fn(async () => ({ readerOutbox, close })),
    getConnectivitySnapshot: () => connectivity,
    subscribeConnectivity: (listener) => { connectivityListener = listener; return () => { connectivityListener = () => undefined; }; },
    subscribeOutboxChange: (listener) => { outboxListener = listener; return () => { outboxListener = () => undefined; }; },
    subscribeVisibility: (listener) => { visibilityListener = listener; return () => { visibilityListener = () => undefined; }; },
    isVisible: () => visible,
    clock: { now: () => now },
    setTimer,
    clearTimer,
    syncPending,
    reportFailure,
  };
  return {
    list, close, clearTimer, syncPending, reportFailure,
    start: (onSweepCompleted?: Parameters<typeof startOfflineReaderRetrySchedulerLifecycle>[0]["onSweepCompleted"]) => (
      startOfflineReaderRetrySchedulerLifecycle({
        namespaceKey: "account-a", client: client(), onSweepCompleted,
      }, dependencies)
    ),
    setIntents: (next: ReaderOutboxIntent[]) => { intents = next; },
    setNow: (value: number) => { now = value; },
    setConnectivity: (value: typeof connectivity) => { connectivity = value; },
    setVisible: (value: boolean) => { visible = value; },
    publishOutboxChange: (namespaceKey: string) => outboxListener(namespaceKey),
    fireConnectivity: () => connectivityListener(),
    fireVisibility: () => visibilityListener(),
    fireTimer: () => {
      const entry = [...timers.entries()][0];
      if (!entry) throw new Error("No scheduled timer.");
      timers.delete(entry[0]);
      entry[1].callback();
    },
    activeTimerCount: () => timers.size,
    waitForTimer: async (delay: number) => vi.waitFor(() => {
      expect([...timers.values()].map((timer) => timer.delay)).toEqual([delay]);
    }),
  };
}

function deferredProgress(retryEligibleAt: number): ReplaceReaderProgressIntent {
  return {
    type: "replace-progress",
    namespaceKey: "account-a",
    bookId: "book-1",
    serverSessionId: "session-1",
    intentRevision: 1,
    progress: { cfi: "epubcfi(/6/2)", percentage: 10, locationLabel: "010% - One" },
    attempt: {
      revision: 1, classification: "retry-later", attemptCount: 1, attemptedAt: 500, retryEligibleAt,
    },
  };
}

function completed(outcome = {}) {
  return {
    status: "completed" as const,
    discoveredBooks: 1,
    attemptedBooks: 1,
    outcome: { ...createOfflineReaderSyncOutcome(), ...outcome },
  };
}

function client(): OfflineReaderSyncClient {
  const unexpected = async () => { throw new Error("Scheduler must use the pending sync sweep."); };
  return {
    marginalia: {
      books: { getActiveSession: unexpected, open: unexpected },
      sessions: { batchAnnotations: unexpected, replaceProgress: unexpected },
    },
  };
}
