type OfflineCachedValue<T> = {
  value: T;
  fetchedAt: number;
};

export type OfflineCacheRefreshError = {
  kind: "refresh-failed";
};

export type OfflineCacheResultState<T> =
  | { status: "missing" }
  | ({ status: "fresh" } & OfflineCachedValue<T>)
  | ({ status: "stale" } & OfflineCachedValue<T>)
  | ({ status: "refreshing" } & OfflineCachedValue<T>)
  | ({ status: "refreshFailed"; error: OfflineCacheRefreshError } & OfflineCachedValue<T>);

export type ClassifyOfflineCachedValueInput<T> = {
  value?: T;
  fetchedAt?: number | null;
  now: number;
  maxAgeMs: number;
};

export function classifyOfflineCachedValue<T>(
  input: ClassifyOfflineCachedValueInput<T>,
): OfflineCacheResultState<T> {
  if (input.value === undefined || input.fetchedAt === undefined || input.fetchedAt === null) {
    return { status: "missing" };
  }

  return {
    status: input.now - input.fetchedAt <= input.maxAgeMs ? "fresh" : "stale",
    value: input.value,
    fetchedAt: input.fetchedAt,
  };
}

export function withOfflineCacheRefreshStarted<T>(
  state: OfflineCacheResultState<T>,
): OfflineCacheResultState<T> {
  if (state.status === "missing") return state;

  return {
    status: "refreshing",
    value: state.value,
    fetchedAt: state.fetchedAt,
  };
}

export function withOfflineCacheRefreshSucceeded<T>(
  value: T,
  fetchedAt: number,
): OfflineCacheResultState<T> {
  return { status: "fresh", value, fetchedAt };
}

export function withOfflineCacheRefreshFailed<T>(
  state: OfflineCacheResultState<T>,
  _error: unknown,
): OfflineCacheResultState<T> {
  if (state.status === "missing") return state;

  return {
    status: "refreshFailed",
    value: state.value,
    fetchedAt: state.fetchedAt,
    error: { kind: "refresh-failed" },
  };
}
