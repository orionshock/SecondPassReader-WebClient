import { describe, expect, it, vi } from "vitest";
import {
  CurrentSessionAnnotationController,
  CurrentSessionAnnotationStaleGenerationError,
} from "../features/reader/session/CurrentSessionAnnotation.Controller";
import type { MarginaliaAnnotation } from "@secondpass/client";

const annotations = (id: string): MarginaliaAnnotation[] => [{
  id,
  clientId: `${id}-client`,
  kind: "bookmark",
  location: { cfi: `epubcfi(/6/${id.length})`, locationLabel: "Chapter" },
  createdAt: "created",
  updatedAt: "updated",
}];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createHarness(controller: CurrentSessionAnnotationController, identity = "book-1|session-1") {
  const setAnnotations = vi.fn();
  const setBusy = vi.fn();
  const setError = vi.fn();
  controller.activate(identity, { setAnnotations, setBusy, setError });
  return { setAnnotations, setBusy, setError };
}

describe("CurrentSessionAnnotationController", () => {
  it("serializes mutations, publishes full responses in order, and stays busy until the queue drains", async () => {
    const controller = new CurrentSessionAnnotationController();
    const observer = createHarness(controller);
    const first = deferred<{ value: string; annotations: MarginaliaAnnotation[] }>();
    const secondRun = vi.fn(async () => ({ value: "second", annotations: annotations("second") }));

    const firstResult = controller.mutate({
      run: () => first.promise,
      getErrorMessage: () => "first failed",
    });
    const secondResult = controller.mutate({
      run: secondRun,
      getErrorMessage: () => "second failed",
    });

    expect(secondRun).not.toHaveBeenCalled();
    expect(observer.setBusy).toHaveBeenLastCalledWith(true);
    first.resolve({ value: "first", annotations: annotations("first") });

    await expect(firstResult).resolves.toBe("first");
    await expect(secondResult).resolves.toBe("second");
    expect(observer.setAnnotations.mock.calls.map(([value]) => value[0].id)).toEqual(["first", "second"]);
    expect(observer.setBusy).toHaveBeenLastCalledWith(false);
  });

  it("continues draining after a failed mutation", async () => {
    const controller = new CurrentSessionAnnotationController();
    const observer = createHarness(controller);
    const failure = new Error("write failed");
    const nextRun = vi.fn(async () => ({ value: "saved", annotations: annotations("saved") }));

    const failed = controller.mutate({
      run: () => Promise.reject(failure),
      getErrorMessage: () => "Failed to update highlight.",
    });
    const next = controller.mutate({
      run: nextRun,
      getErrorMessage: () => "next failed",
    });

    await expect(failed).rejects.toBe(failure);
    await expect(next).resolves.toBe("saved");
    expect(nextRun).toHaveBeenCalledOnce();
    expect(observer.setAnnotations).toHaveBeenLastCalledWith(annotations("saved"));
    expect(observer.setBusy).toHaveBeenLastCalledWith(false);
  });

  it("suppresses annotations and errors from a stale session generation", async () => {
    const controller = new CurrentSessionAnnotationController();
    const oldObserver = createHarness(controller, "book-1|session-1");
    const oldRun = deferred<{
      value: string;
      annotations: MarginaliaAnnotation[];
      errorMessage?: string;
    }>();
    const oldResult = controller.mutate({
      run: () => oldRun.promise,
      getErrorMessage: () => "old session failed",
    });

    const newObserver = createHarness(controller, "book-2|session-2");
    oldRun.resolve({
      value: "old",
      annotations: annotations("old"),
      errorMessage: "old session failed",
    });

    await expect(oldResult).rejects.toBeInstanceOf(CurrentSessionAnnotationStaleGenerationError);
    expect(oldObserver.setAnnotations).not.toHaveBeenCalled();
    expect(oldObserver.setError).not.toHaveBeenCalledWith("old session failed");
    expect(newObserver.setAnnotations).not.toHaveBeenCalled();
    expect(newObserver.setError).not.toHaveBeenCalledWith("old session failed");
  });
});
