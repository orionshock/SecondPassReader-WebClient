import type { MarginaliaAnnotation } from "@secondpass/client";

export type CurrentSessionAnnotationExecutionOutcome<T> = {
  value: T;
  annotations?: MarginaliaAnnotation[];
  errorMessage?: string;
};

export type CurrentSessionAnnotationExecution<T> = {
  run: () => Promise<CurrentSessionAnnotationExecutionOutcome<T>>;
  getErrorMessage: (error: unknown) => string;
};

type CurrentSessionAnnotationObservers = {
  setAnnotations: (annotations: MarginaliaAnnotation[]) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
};

type ActiveSession = {
  identity: string;
  generation: number;
  pendingCount: number;
  observers: CurrentSessionAnnotationObservers;
};

type QueuedMutation<T> = {
  generation: number;
  mutation: CurrentSessionAnnotationExecution<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export class CurrentSessionAnnotationStaleGenerationError extends Error {
  constructor() {
    super("Current annotation session is no longer active.");
    this.name = "CurrentSessionAnnotationStaleGenerationError";
  }
}

export class CurrentSessionAnnotationController {
  private active: ActiveSession | null = null;
  private generation = 0;
  private queue: Array<QueuedMutation<unknown>> = [];
  private running = false;

  activate(identity: string, observers: CurrentSessionAnnotationObservers): void {
    if (this.active?.identity === identity) {
      this.active.observers = observers;
      return;
    }

    this.invalidatePending();
    this.generation += 1;
    this.active = { identity, generation: this.generation, pendingCount: 0, observers };
    observers.setBusy(false);
  }

  detach(identity: string): void {
    if (this.active?.identity !== identity) return;
    this.invalidatePending();
    this.generation += 1;
    this.active = null;
  }

  mutate<T>(mutation: CurrentSessionAnnotationExecution<T>): Promise<T> {
    const active = this.active;
    if (!active) return Promise.reject(new CurrentSessionAnnotationStaleGenerationError());

    active.pendingCount += 1;
    active.observers.setBusy(true);

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        generation: active.generation,
        mutation,
        resolve,
        reject,
      } as QueuedMutation<unknown>);
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
          queued.reject(new CurrentSessionAnnotationStaleGenerationError());
          continue;
        }

        active.observers.setError(null);
        try {
          const outcome = await queued.mutation.run();
          if (!this.isCurrent(active)) throw new CurrentSessionAnnotationStaleGenerationError();
          if (outcome.annotations) active.observers.setAnnotations(outcome.annotations);
          if (outcome.errorMessage) active.observers.setError(outcome.errorMessage);
          queued.resolve(outcome.value);
        } catch (error) {
          if (!this.isCurrent(active)) {
            queued.reject(new CurrentSessionAnnotationStaleGenerationError());
          } else {
            active.observers.setError(queued.mutation.getErrorMessage(error));
            queued.reject(error);
          }
        } finally {
          if (this.isCurrent(active)) {
            active.pendingCount = Math.max(0, active.pendingCount - 1);
            active.observers.setBusy(active.pendingCount > 0);
          }
        }
      }
    } finally {
      this.running = false;
      if (this.queue.length > 0) void this.drain();
    }
  }

  private isCurrent(session: ActiveSession): boolean {
    return this.active === session && this.active.generation === session.generation;
  }

  private invalidatePending(): void {
    const pending = this.queue.splice(0);
    for (const queued of pending) {
      queued.reject(new CurrentSessionAnnotationStaleGenerationError());
    }
  }
}
