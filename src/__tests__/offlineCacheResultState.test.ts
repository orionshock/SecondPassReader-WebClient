import { describe, expect, it } from "vitest";
import {
  classifyOfflineCachedValue,
  withOfflineCacheRefreshFailed,
  withOfflineCacheRefreshStarted,
  withOfflineCacheRefreshSucceeded,
} from "../app/offline/OfflineCacheResult.State";

describe("offline cache result state", () => {
  it.each([
    { value: undefined, fetchedAt: 1_000 },
    { value: "cached", fetchedAt: undefined },
    { value: "cached", fetchedAt: null },
  ])("is missing when a cached value or its fetch time is absent", ({ value, fetchedAt }) => {
    expect(classifyOfflineCachedValue({ value, fetchedAt, now: 2_000, maxAgeMs: 1_000 })).toEqual({
      status: "missing",
    });
  });

  it("classifies a value within its maximum age as fresh", () => {
    expect(classifyOfflineCachedValue({
      value: { count: 2 },
      fetchedAt: 1_500,
      now: 2_000,
      maxAgeMs: 1_000,
    })).toEqual({ status: "fresh", value: { count: 2 }, fetchedAt: 1_500 });
  });

  it("classifies a value older than its maximum age as stale", () => {
    expect(classifyOfflineCachedValue({
      value: { count: 2 },
      fetchedAt: 999,
      now: 2_000,
      maxAgeMs: 1_000,
    })).toEqual({ status: "stale", value: { count: 2 }, fetchedAt: 999 });
  });

  it("treats the exact maximum-age boundary as fresh", () => {
    expect(classifyOfflineCachedValue({
      value: "cached",
      fetchedAt: 1_000,
      now: 2_000,
      maxAgeMs: 1_000,
    }).status).toBe("fresh");
  });

  it("preserves a usable cached value while refresh is in progress", () => {
    expect(withOfflineCacheRefreshStarted({
      status: "stale",
      value: "cached",
      fetchedAt: 1_000,
    })).toEqual({ status: "refreshing", value: "cached", fetchedAt: 1_000 });
  });

  it("replaces the cached value and fetch time after refresh succeeds", () => {
    expect(withOfflineCacheRefreshSucceeded("replacement", 3_000)).toEqual({
      status: "fresh",
      value: "replacement",
      fetchedAt: 3_000,
    });
  });

  it("preserves cached data after refresh failure without retaining the raw error", () => {
    const rawError = new Error("request failed for https://secret.example/?token=secret");

    expect(withOfflineCacheRefreshFailed({
      status: "stale",
      value: "cached",
      fetchedAt: 1_000,
    }, rawError)).toEqual({
      status: "refreshFailed",
      value: "cached",
      fetchedAt: 1_000,
      error: { kind: "refresh-failed" },
    });
  });

  it("does not turn a no-cache refresh failure into cached data", () => {
    expect(withOfflineCacheRefreshFailed({ status: "missing" }, new Error("offline"))).toEqual({
      status: "missing",
    });
  });
});
