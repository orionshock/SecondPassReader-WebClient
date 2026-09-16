export type ReaderImportActivationLease = {
  signal: AbortSignal;
  isCurrent: () => boolean;
};

// Job and row identify the review target; generation distinguishes repeated
// activation or replacement work that targets those same logical identifiers.
export class ReaderImportReviewLifetime {
  private generation = 0;
  private active: { jobId: string; rowId: string; controller: AbortController } | null = null;

  beginActivation(jobId: string, rowId: string, ownsReview: () => boolean): ReaderImportActivationLease {
    this.invalidate();
    const controller = new AbortController();
    const generation = this.generation;
    this.active = { jobId, rowId, controller };
    return {
      signal: controller.signal,
      isCurrent: () => this.generation === generation
        && this.active?.jobId === jobId
        && this.active.rowId === rowId
        && ownsReview(),
    };
  }

  beginJobReplacement(): () => boolean {
    this.invalidate();
    const generation = this.generation;
    return () => this.generation === generation;
  }

  invalidate(): void {
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
  }

  invalidateJob(jobId: string): void {
    if (this.active?.jobId === jobId) this.invalidate();
  }
}
