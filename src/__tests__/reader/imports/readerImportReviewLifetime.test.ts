import { describe, expect, it } from "vitest";
import { ReaderImportReviewLifetime } from "../../../features/reader/imports/ReaderImportReview.Lifecycle";

describe("reader import review lifetime", () => {
  it("supersedes repeated activation of the same row in the same job", () => {
    const lifetime = new ReaderImportReviewLifetime();
    const first = lifetime.beginActivation("job-a", "row-1", () => true);
    const second = lifetime.beginActivation("job-a", "row-1", () => true);

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("keeps reused row IDs scoped to their import job", () => {
    const lifetime = new ReaderImportReviewLifetime();
    const oldJob = lifetime.beginActivation("job-a", "row-1", () => true);
    const replacementJob = lifetime.beginActivation("job-b", "row-1", () => true);

    lifetime.invalidateJob("job-a");
    expect(oldJob.isCurrent()).toBe(false);
    expect(replacementJob.isCurrent()).toBe(true);

    lifetime.invalidateJob("job-b");
    expect(replacementJob.signal.aborted).toBe(true);
    expect(replacementJob.isCurrent()).toBe(false);
  });

  it("requires the originating review to remain open", () => {
    const lifetime = new ReaderImportReviewLifetime();
    let reviewOpen = true;
    const activation = lifetime.beginActivation("job-a", "row-1", () => reviewOpen);

    reviewOpen = false;

    expect(activation.isCurrent()).toBe(false);
  });

  it("supersedes an older asynchronous job replacement", () => {
    const lifetime = new ReaderImportReviewLifetime();
    const firstReplacement = lifetime.beginJobReplacement();
    const secondReplacement = lifetime.beginJobReplacement();

    expect(firstReplacement()).toBe(false);
    expect(secondReplacement()).toBe(true);
  });
});
