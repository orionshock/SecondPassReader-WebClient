import type { ReaderSearchResult } from "../domain/ReaderDomain.Types";

type QueuedSearch = {
  run: () => Promise<ReaderSearchResult[]>;
  signal?: AbortSignal;
  started: boolean;
  resolve: (results: ReaderSearchResult[]) => void;
  reject: (error: unknown) => void;
  removeAbortListener?: () => void;
};

export class ReaderSearchController {
  private queue: QueuedSearch[] = [];
  private running = false;

  search(
    run: () => Promise<ReaderSearchResult[]>,
    signal?: AbortSignal,
  ): Promise<ReaderSearchResult[]> {
    if (signal?.aborted) return Promise.reject(createSearchAbortError());

    return new Promise((resolve, reject) => {
      const queued: QueuedSearch = { run, signal, started: false, resolve, reject };
      if (signal) {
        const onAbort = () => {
          if (queued.started) return;
          const index = this.queue.indexOf(queued);
          if (index >= 0) this.queue.splice(index, 1);
          queued.removeAbortListener?.();
          reject(createSearchAbortError());
        };
        signal.addEventListener("abort", onAbort, { once: true });
        queued.removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      }
      this.queue.push(queued);
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const queued = this.queue.shift()!;
        queued.removeAbortListener?.();
        if (queued.signal?.aborted) {
          queued.reject(createSearchAbortError());
          continue;
        }
        queued.started = true;
        try {
          queued.resolve(await queued.run());
        } catch (error) {
          queued.reject(error);
        }
      }
    } finally {
      this.running = false;
      if (this.queue.length > 0) void this.drain();
    }
  }
}

function createSearchAbortError(): DOMException {
  return new DOMException("Search cancelled.", "AbortError");
}
