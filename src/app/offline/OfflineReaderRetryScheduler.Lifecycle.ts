import type { BrowserConnectivityStatus } from "../connectivity/BrowserConnectivity.State";
import {
  getBrowserConnectivitySnapshot,
  subscribeToBrowserConnectivity,
} from "../connectivity/BrowserConnectivity.State";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";
import type { OfflineClock } from "./OfflineClock.Types";
import {
  syncPendingOfflineReaderWork,
  type OfflineReaderPendingSyncResult,
} from "./OfflineReaderPendingSync.Actions";
import { getOfflineReaderRetrySchedule } from "./OfflineReaderRetrySchedule.Policy";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "./IndexedDbOfflineRepositories.Factory";
import {
  subscribeToOfflineReaderOutboxChange,
} from "./OfflineReaderOutboxChange.State";
import type { OfflineReaderSyncClient } from "./OfflineReaderSync.Actions";

const RETRY_CONTENTION_DEFER_MS = 30_000;
type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

type RetryRepositories = Pick<IndexedDbOfflineRepositories<Blob>, "readerOutbox" | "close">;

export type OfflineReaderRetrySchedulerDependencies = {
  openRepositories(): Promise<RetryRepositories>;
  getConnectivitySnapshot(): BrowserConnectivityStatus;
  subscribeConnectivity(listener: () => void): () => void;
  subscribeOutboxChange(listener: (namespaceKey: string) => void): () => void;
  subscribeVisibility(listener: () => void): () => void;
  isVisible(): boolean;
  clock: OfflineClock;
  setTimer(callback: () => void, delayMs: number): TimerHandle;
  clearTimer(timer: TimerHandle): void;
  syncPending(input: {
    namespaceKey: string;
    client: OfflineReaderSyncClient;
    mode: "if-available";
    attemptMode: "automatic";
    isCurrent(): boolean;
    onCompleted?: (result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>) => void;
  }): Promise<OfflineReaderPendingSyncResult>;
  reportFailure(operation: "open-repositories" | "scan-outbox" | "retry-sweep"): void;
};

type RetrySchedulerInput = {
  namespaceKey: string | null;
  client: OfflineReaderSyncClient | null;
  isCurrent?: () => boolean;
  onSweepCompleted?: (result: Extract<OfflineReaderPendingSyncResult, { status: "completed" }>) => void;
};

export function startOfflineReaderRetrySchedulerLifecycle(
  input: RetrySchedulerInput,
  dependencyOverrides: Partial<OfflineReaderRetrySchedulerDependencies> = {},
): () => void {
  const namespaceKey = input.namespaceKey?.trim() ?? "";
  if (!namespaceKey || !input.client) return () => undefined;

  const dependencies: OfflineReaderRetrySchedulerDependencies = {
    openRepositories: () => openIndexedDbOfflineRepositories<Blob>(),
    getConnectivitySnapshot: getBrowserConnectivitySnapshot,
    subscribeConnectivity: subscribeToBrowserConnectivity,
    subscribeOutboxChange: subscribeToOfflineReaderOutboxChange,
    subscribeVisibility,
    isVisible: () => typeof document === "undefined" || document.visibilityState === "visible",
    clock: { now: () => Date.now() },
    setTimer: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    clearTimer: (timer) => globalThis.clearTimeout(timer),
    syncPending: syncPendingOfflineReaderWork,
    reportFailure: reportRetrySchedulerFailure,
    ...dependencyOverrides,
  };
  const client = input.client;
  const generationIsCurrent = input.isCurrent ?? (() => true);
  let disposed = false;
  let repositories: RetryRepositories | null = null;
  let timer: TimerHandle | null = null;
  let scanning = false;
  let sweeping = false;
  let rescanRequested = false;
  let minimumWakeAt = 0;

  const current = () => !disposed && generationIsCurrent();
  const clearTimer = () => {
    if (timer === null) return;
    dependencies.clearTimer(timer);
    timer = null;
  };

  const requestScan = (notBefore = 0) => {
    minimumWakeAt = Math.max(minimumWakeAt, notBefore);
    if (!current() || !repositories) return;
    if (scanning || sweeping) {
      rescanRequested = true;
      return;
    }
    void scan();
  };

  const requestSweep = async () => {
    if (!current() || sweeping || dependencies.getConnectivitySnapshot() !== "online") return;
    sweeping = true;
    clearTimer();
    try {
      await dependencies.syncPending({
        namespaceKey,
        client,
        mode: "if-available",
        attemptMode: "automatic",
        isCurrent: current,
        onCompleted: input.onSweepCompleted,
      });
    } catch {
      dependencies.reportFailure("retry-sweep");
    } finally {
      sweeping = false;
      if (current()) requestScan(dependencies.clock.now() + RETRY_CONTENTION_DEFER_MS);
    }
  };

  const scan = async () => {
    const currentRepositories = repositories;
    if (!currentRepositories || !current() || scanning || sweeping) return;
    if (dependencies.getConnectivitySnapshot() !== "online") {
      clearTimer();
      return;
    }
    scanning = true;
    rescanRequested = false;
    try {
      const intents = await currentRepositories.readerOutbox.list(namespaceKey);
      if (!current()) return;
      const now = dependencies.clock.now();
      const schedule = getOfflineReaderRetrySchedule(intents, now);
      clearTimer();
      if (schedule.status === "none") {
        minimumWakeAt = 0;
      } else {
        if (minimumWakeAt <= now) minimumWakeAt = 0;
        const wakeAt = Math.max(schedule.retryEligibleAt, minimumWakeAt);
        if (wakeAt <= now) {
          void requestSweep();
        } else {
          timer = dependencies.setTimer(() => {
            timer = null;
            void requestSweep();
          }, wakeAt - now);
        }
      }
    } catch {
      clearTimer();
      dependencies.reportFailure("scan-outbox");
    } finally {
      scanning = false;
      if (rescanRequested && !sweeping) requestScan();
    }
  };

  const unsubscribeConnectivity = dependencies.subscribeConnectivity(() => {
    if (!current()) return;
    if (dependencies.getConnectivitySnapshot() === "online") requestScan();
    else clearTimer();
  });
  const unsubscribeOutbox = dependencies.subscribeOutboxChange((changedNamespace) => {
    if (changedNamespace === namespaceKey) requestScan();
  });
  const unsubscribeVisibility = dependencies.subscribeVisibility(() => {
    if (current() && dependencies.isVisible()) requestScan();
  });

  void dependencies.openRepositories().then((opened) => {
    if (!current()) {
      opened.close();
      return;
    }
    repositories = opened;
    requestScan();
  }, () => {
    if (current()) dependencies.reportFailure("open-repositories");
  });

  return () => {
    if (disposed) return;
    disposed = true;
    clearTimer();
    unsubscribeConnectivity();
    unsubscribeOutbox();
    unsubscribeVisibility();
    repositories?.close();
    repositories = null;
  };
}

function subscribeVisibility(listener: () => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

function reportRetrySchedulerFailure(operation: string): void {
  debugWarn("reader", "offline Reader retry scheduler did not complete", { operation });
}
