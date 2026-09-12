import type { EpubTsBookEngine } from "../engine/EpubTsBook.Engine";
import { stabilizeReaderReflow } from "./ReaderReflow.Coordinator";

export type ReaderRuntimeOperationContext = {
  engine: EpubTsBookEngine;
  generation: number;
  isCurrent: () => boolean;
};

export type ReaderRuntimeOperation<T> = {
  kind: string;
  run: (context: ReaderRuntimeOperationContext) => Promise<T>;
  after?: (value: T, context: ReaderRuntimeOperationContext) => Promise<void> | void;
};

export type ReaderRuntimeReflowKind = "resize" | "settings";

export type ReaderRuntimeReflowOperation = {
  reflow: (engine: EpubTsBookEngine) => Promise<void>;
  refreshMarks: (engine: EpubTsBookEngine) => void;
  reanchorStagedToolbar: () => Promise<void>;
};

type ActiveRuntime = {
  engine: EpubTsBookEngine;
  generation: number;
};

type QueueWaiter = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

type QueuedOperation = {
  generation: number;
  coalesceKey?: ReaderRuntimeReflowKind;
  operation: ReaderRuntimeOperation<unknown>;
  waiters: QueueWaiter[];
};

export class ReaderRuntimeUnavailableError extends Error {
  constructor(message = "Reader runtime is not available.") {
    super(message);
    this.name = "ReaderRuntimeUnavailableError";
  }
}

export class ReaderRuntimeStaleGenerationError extends Error {
  constructor() {
    super("Reader runtime generation is no longer active.");
    this.name = "ReaderRuntimeStaleGenerationError";
  }
}

// Serializes engine operations for one generation. Reflows coalesce at the queue tail,
// while detach rejects work that belongs to a destroyed engine.
export class ReaderRuntimeController {
  private active: ActiveRuntime | null = null;
  private queue: QueuedOperation[] = [];
  private running = false;

  attach(engine: EpubTsBookEngine, generation: number): void {
    if (this.active?.engine === engine && this.active.generation === generation) return;
    this.rejectPendingAsStale();
    this.active = { engine, generation };
  }

  detach(generation: number): void {
    if (this.active?.generation !== generation) return;
    this.active = null;
    this.rejectPendingAsStale();
  }

  run<T>(operation: ReaderRuntimeOperation<T>): Promise<T> {
    const active = this.active;
    if (!active) return Promise.reject(new ReaderRuntimeUnavailableError());
    return this.enqueue(active.generation, operation);
  }

  stabilizeReflow(kind: ReaderRuntimeReflowKind, operation: ReaderRuntimeReflowOperation): Promise<void> {
    const active = this.active;
    if (!active) return Promise.reject(new ReaderRuntimeUnavailableError());

    return this.enqueue(active.generation, {
      kind,
      run: async (context) => {
        await stabilizeReaderReflow({
          reflow: () => operation.reflow(context.engine),
          refreshMarks: () => {
            if (context.isCurrent()) operation.refreshMarks(context.engine);
          },
          reanchorStagedToolbar: () => context.isCurrent()
            ? operation.reanchorStagedToolbar()
            : Promise.resolve(),
        });
      },
    }, kind);
  }

  private enqueue<T>(
    generation: number,
    operation: ReaderRuntimeOperation<T>,
    coalesceKey?: ReaderRuntimeReflowKind,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const waiter: QueueWaiter = {
        resolve: (value) => resolve(value as T),
        reject,
      };
      const existing = coalesceKey
        ? findCoalescibleTail(this.queue, generation, coalesceKey)
        : undefined;

      if (existing) {
        existing.operation = operation as ReaderRuntimeOperation<unknown>;
        existing.waiters.push(waiter);
      } else {
        this.queue.push({
          generation,
          coalesceKey,
          operation: operation as ReaderRuntimeOperation<unknown>,
          waiters: [waiter],
        });
      }
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const queued = this.queue.shift()!;
        const active = this.active;
        if (!active || active.generation !== queued.generation) {
          rejectWaiters(queued.waiters, new ReaderRuntimeStaleGenerationError());
          continue;
        }

        const context: ReaderRuntimeOperationContext = {
          engine: active.engine,
          generation: active.generation,
          isCurrent: () => this.isCurrent(active),
        };

        try {
          const value = await queued.operation.run(context);
          if (!context.isCurrent()) throw new ReaderRuntimeStaleGenerationError();
          if (queued.operation.after) {
            await queued.operation.after(value, context);
            if (!context.isCurrent()) throw new ReaderRuntimeStaleGenerationError();
          }
          resolveWaiters(queued.waiters, value);
        } catch (error) {
          rejectWaiters(
            queued.waiters,
            context.isCurrent() ? error : new ReaderRuntimeStaleGenerationError(),
          );
        }
      }
    } finally {
      this.running = false;
      if (this.queue.length > 0) void this.drain();
    }
  }

  private isCurrent(runtime: ActiveRuntime): boolean {
    return this.active?.engine === runtime.engine && this.active.generation === runtime.generation;
  }

  private rejectPendingAsStale(): void {
    const pending = this.queue.splice(0);
    for (const queued of pending) {
      rejectWaiters(queued.waiters, new ReaderRuntimeStaleGenerationError());
    }
  }
}

function resolveWaiters(waiters: QueueWaiter[], value: unknown): void {
  for (const waiter of waiters) waiter.resolve(value);
}

function rejectWaiters(waiters: QueueWaiter[], error: unknown): void {
  for (const waiter of waiters) waiter.reject(error);
}

function findCoalescibleTail(
  queue: QueuedOperation[],
  generation: number,
  coalesceKey: ReaderRuntimeReflowKind,
): QueuedOperation | undefined {
  const queued = queue[queue.length - 1];
  return queued?.generation === generation && queued.coalesceKey === coalesceKey ? queued : undefined;
}
