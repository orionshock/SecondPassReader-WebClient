import type { ReaderSettings } from "../../../storage/ReaderSettings.Store";
import type { EpubTsBookEngine } from "../engine/EpubTsBook.Engine";

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

export type ReaderRuntimeReflowIntent =
  | { type: "apply-settings"; settings: ReaderSettings }
  | { type: "resize-to-mount"; timing: "current-layout" }
  | { type: "resize-to-mount"; timing: "after-layout"; isRequested?: () => boolean };

export type ReaderRuntimeReflowDependencies = {
  getProtectedRestoreCfi(generation: number): string | null;
  runProtectedLayoutMutation<T>(operation: () => Promise<T>): Promise<T>;
  reanchorStagedToolbar(): Promise<void>;
  waitForLayout(): Promise<void>;
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

  constructor(private readonly reflowDependencies: ReaderRuntimeReflowDependencies) {}

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

  reflow(intent: ReaderRuntimeReflowIntent): Promise<void> {
    const active = this.active;
    if (!active) return Promise.reject(new ReaderRuntimeUnavailableError());
    const kind = reflowKind(intent);

    return this.enqueue(active.generation, {
      kind,
      run: (context) => this.runReflow(context, intent),
    }, kind);
  }

  private async runReflow(
    context: ReaderRuntimeOperationContext,
    intent: ReaderRuntimeReflowIntent,
  ): Promise<void> {
    let mutationApplied = true;
    await this.reflowDependencies.runProtectedLayoutMutation(async () => {
      if (intent.type === "resize-to-mount" && intent.timing === "after-layout") {
        await this.reflowDependencies.waitForLayout();
        if (!context.isCurrent()
          || intent.isRequested?.() === false) {
          mutationApplied = false;
          return;
        }
      }

      const preserveCfi = this.reflowDependencies.getProtectedRestoreCfi(context.generation);
      if (intent.type === "apply-settings") {
        await context.engine.applyDisplaySettings(intent.settings, { preserveCfi });
      } else {
        await context.engine.resizeToMount({ preserveCfi });
      }
    });

    if (!mutationApplied || !context.isCurrent()) return;
    // Reflow is one viewport mutation protocol: preserve the anchor, serialize the mutation,
    // refresh durable marks, then re-anchor staged UI.
    context.engine.refreshHighlightMarks();
    try {
      await this.reflowDependencies.reanchorStagedToolbar();
    } catch {
      // Geometry measurement is best-effort. Keep the staged selection and fallback position.
    }
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

function reflowKind(intent: ReaderRuntimeReflowIntent): ReaderRuntimeReflowKind {
  return intent.type === "apply-settings" ? "settings" : "resize";
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
