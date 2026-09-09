import { describe, expect, it, vi } from "vitest";
import {
  createOfflineReaderAuthenticatedSyncGeneration,
  startOfflineReaderAuthenticatedSyncLifecycle,
  type OfflineReaderAuthenticatedSyncDependencies,
} from "../app/offline/OfflineReaderAuthenticatedSync.Lifecycle";
import type { OfflineReaderSyncClient } from "../app/offline/OfflineReaderSync.Actions";

describe("authenticated offline Reader sync lifecycle", () => {
  it("starts reconnect each mount but startup only once for the same generation", () => {
    const generation = createOfflineReaderAuthenticatedSyncGeneration();
    const dependencies = lifecycleDependencies();

    const firstStop = startOfflineReaderAuthenticatedSyncLifecycle({
      namespaceKey: "account-a",
      client: client(),
      generation,
    }, dependencies);
    const startupInput = dependencies.startStartup.mock.calls[0][0];
    startupInput.onEligibilityDecided?.();
    firstStop();

    const secondStop = startOfflineReaderAuthenticatedSyncLifecycle({
      namespaceKey: "account-a",
      client: client(),
      generation,
    }, dependencies);

    expect(dependencies.startReconnect).toHaveBeenCalledTimes(2);
    expect(dependencies.startStartup).toHaveBeenCalledOnce();
    expect(generation.active).toBe(true);
    secondStop();
    expect(generation.active).toBe(false);
  });

  it("allows a new authenticated namespace generation its own startup attempt", () => {
    const dependencies = lifecycleDependencies();
    const first = createOfflineReaderAuthenticatedSyncGeneration();
    const second = createOfflineReaderAuthenticatedSyncGeneration();

    const stopFirst = startOfflineReaderAuthenticatedSyncLifecycle({
      namespaceKey: "account-a",
      client: client(),
      generation: first,
    }, dependencies);
    const stopSecond = startOfflineReaderAuthenticatedSyncLifecycle({
      namespaceKey: "account-b",
      client: client(),
      generation: second,
    }, dependencies);

    expect(dependencies.startStartup.mock.calls.map(([input]) => input.namespaceKey))
      .toEqual(["account-a", "account-b"]);
    stopFirst();
    stopSecond();
  });

  it("gives startup and reconnect the same completed-sweep notice owner", () => {
    const dependencies = lifecycleDependencies();
    const onSweepCompleted = vi.fn();
    const stop = startOfflineReaderAuthenticatedSyncLifecycle({
      namespaceKey: "account-a",
      client: client(),
      generation: createOfflineReaderAuthenticatedSyncGeneration(),
      onSweepCompleted,
    }, dependencies);

    expect(dependencies.startStartup.mock.calls[0][0].onSweepCompleted).toBe(onSweepCompleted);
    expect(dependencies.startReconnect.mock.calls[0][0].onSweepCompleted).toBe(onSweepCompleted);
    stop();
  });
});

function lifecycleDependencies() {
  const stop = vi.fn();
  return {
    startReconnect: vi.fn<OfflineReaderAuthenticatedSyncDependencies["startReconnect"]>(() => stop),
    startStartup: vi.fn<OfflineReaderAuthenticatedSyncDependencies["startStartup"]>(() => stop),
  } satisfies OfflineReaderAuthenticatedSyncDependencies;
}

function client(): OfflineReaderSyncClient {
  const unexpected = async () => { throw new Error("Lifecycle composition does not call server APIs."); };
  return {
    marginalia: {
      books: { getActiveSession: unexpected, open: unexpected },
      sessions: { batchAnnotations: unexpected, replaceProgress: unexpected },
    },
  };
}
