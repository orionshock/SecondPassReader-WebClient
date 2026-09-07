import { ApiError } from "@secondpass/client";
import type { MarginaliaProgress } from "@secondpass/client";

export const READING_PROGRESS_AUTOSAVE_DELAY_MS = 3000;

export type ReadingProgressSavePayload = {
  cfi: string;
  locationLabel: string;
};

export type ReadingProgressAutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "closed";

export type ReadingProgressAutosaveState = {
  status: ReadingProgressAutosaveStatus;
  lastSavedAt?: string;
  lastSavedCfi?: string;
  nextSaveAt?: number;
  error?: string;
  dirty?: boolean;
  progress?: MarginaliaProgress;
};

type SaveProgress = (sessionId: string, payload: ReadingProgressSavePayload) => Promise<MarginaliaProgress>;

type AutosaveInput = {
  enabled: boolean;
  autosaveDelayMs: number;
  sessionId: string | null;
  progress: ReadingProgressSavePayload | null;
  saveProgress: SaveProgress | null;
};

type ActiveDrain = {
  generation: number;
  promise: Promise<void>;
};

function payloadKey(payload: ReadingProgressSavePayload | null): string | null {
  return payload ? `${payload.cfi}\u0000${payload.locationLabel}` : null;
}

function progressErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.kind === "unauthorized" || error.kind === "forbidden")) {
    return "Could not save progress. Your device token may be revoked or not allowed to access reading data.";
  }
  if (error instanceof ApiError && error.status === 404) {
    return "Could not save progress. The reading session was not found or is no longer accessible.";
  }
  if (error instanceof Error) return error.message;
  return "Failed to save progress.";
}

function isSessionClosedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

export class ReadingProgressAutosaveController {
  private state: ReadingProgressAutosaveState = { status: "idle" };
  private input: AutosaveInput = {
    enabled: false,
    autosaveDelayMs: READING_PROGRESS_AUTOSAVE_DELAY_MS,
    sessionId: null,
    progress: null,
    saveProgress: null,
  };
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scheduledPayloadKey: string | null = null;
  private inFlightGeneration: number | null = null;
  private lastSavedPayloadKey: string | null = null;
  private seededGeneration: number | null = null;
  private activeDrain: ActiveDrain | null = null;
  private notifyStateChanges = true;
  private closedSessionId: string | null = null;

  constructor(private readonly onStateChange: (state: ReadingProgressAutosaveState) => void) {}

  update(next: AutosaveInput): void {
    this.notifyStateChanges = true;
    const sessionChanged = next.sessionId !== this.input.sessionId;
    const previousEnabled = this.input.enabled;
    const previousPayloadKey = payloadKey(this.input.progress);

    if (sessionChanged) this.resetForSession(next.sessionId);

    const closedSession = next.sessionId !== null && next.sessionId === this.closedSessionId;
    this.input = closedSession ? { ...next, enabled: false } : next;
    const nextPayloadKey = payloadKey(next.progress);
    const canSave = this.input.enabled && Boolean(next.sessionId && next.progress && next.saveProgress);

    if (!canSave) {
      this.clearTimer();
      return;
    }

    const currentGenerationIsSaving = this.inFlightGeneration === this.generation;
    if (currentGenerationIsSaving) {
      if (nextPayloadKey !== previousPayloadKey) {
        this.publish({ ...this.state, status: "saving", dirty: true, nextSaveAt: undefined });
      }
      return;
    }

    if (nextPayloadKey === this.lastSavedPayloadKey) return;
    if (
      !sessionChanged &&
      previousEnabled === next.enabled &&
      previousPayloadKey === nextPayloadKey &&
      this.timer !== null
    ) {
      return;
    }

    this.schedule();
  }

  pause(): void {
    this.generation += 1;
    this.clearTimer();
    this.inFlightGeneration = null;
    this.seededGeneration = null;
    this.activeDrain = null;
  }

  async flushAndPause(): Promise<void> {
    try {
      await this.flushNow();
    } finally {
      this.pause();
    }
  }

  resume(): void {
    this.update({ ...this.input, enabled: true });
  }

  seedSavedProgress(sessionId: string, progress: MarginaliaProgress): void {
    if (sessionId !== this.input.sessionId || this.seededGeneration === this.generation) return;
    const cfi = progress.cfi.trim();
    if (!cfi) return;

    const savedPayload = { cfi, locationLabel: progress.locationLabel };
    const savedKey = payloadKey(savedPayload);
    this.seededGeneration = this.generation;
    this.lastSavedPayloadKey = savedKey;

    const currentPayloadKey = payloadKey(this.input.progress);
    if (currentPayloadKey !== null && currentPayloadKey !== savedKey) return;

    this.clearTimer();
    this.publish({
      status: "saved",
      lastSavedAt: progress.updatedAt,
      lastSavedCfi: cfi,
      dirty: false,
      progress,
    });
  }

  flushNow(options?: { silent?: boolean }): Promise<void> {
    if (options?.silent) this.notifyStateChanges = false;
    this.clearTimer();

    const generation = this.generation;
    const { enabled, progress, saveProgress, sessionId } = this.input;
    if (!enabled || !sessionId || !progress || !saveProgress) return Promise.resolve();

    const currentDrain = this.activeDrain;
    if (currentDrain?.generation === generation) return currentDrain.promise;
    if (payloadKey(progress) === this.lastSavedPayloadKey) return Promise.resolve();
    return this.startDrain(generation);
  }

  getState(): ReadingProgressAutosaveState {
    return this.state;
  }

  private resetForSession(nextSessionId: string | null): void {
    this.generation += 1;
    this.clearTimer();
    this.inFlightGeneration = null;
    this.seededGeneration = null;
    this.activeDrain = null;
    this.lastSavedPayloadKey = null;
    this.closedSessionId = null;
    this.input = { ...this.input, sessionId: nextSessionId, progress: null };
    this.publish({ status: "idle" });
  }

  private schedule(): void {
    const key = payloadKey(this.input.progress);
    if (!key) return;

    this.clearTimer();
    const generation = this.generation;
    this.scheduledPayloadKey = key;
    const nextSaveAt = Date.now() + this.input.autosaveDelayMs;
    this.publish({ ...this.state, status: "pending", error: undefined, dirty: false, nextSaveAt });
    this.timer = setTimeout(() => {
      if (generation !== this.generation || key !== this.scheduledPayloadKey) return;
      this.timer = null;
      this.scheduledPayloadKey = null;
      void this.startDrain(generation);
    }, this.input.autosaveDelayMs);
  }

  private startDrain(generation: number): Promise<void> {
    const currentDrain = this.activeDrain;
    if (currentDrain?.generation === generation) return currentDrain.promise;

    const promise = this.drain(generation);
    const activeDrain = { generation, promise };
    this.activeDrain = activeDrain;
    const clearActiveDrain = () => {
      if (this.activeDrain === activeDrain) this.activeDrain = null;
    };
    void promise.then(clearActiveDrain, clearActiveDrain);
    return promise;
  }

  private async drain(generation: number): Promise<void> {
    while (generation === this.generation) {
      const { enabled, progress, saveProgress, sessionId } = this.input;
      if (!enabled || !sessionId || !progress || !saveProgress) return;

      const attemptedKey = payloadKey(progress);
      if (!attemptedKey || attemptedKey === this.lastSavedPayloadKey) return;

      this.inFlightGeneration = generation;
      this.publish({ ...this.state, status: "saving", error: undefined, dirty: false, nextSaveAt: undefined });

      try {
        const savedProgress = await saveProgress(sessionId, progress);
        if (generation !== this.generation) return;

        this.lastSavedPayloadKey = attemptedKey;
        const hasNewerProgress = payloadKey(this.input.progress) !== attemptedKey;
        this.publish({
          ...this.state,
          status: "saved",
          lastSavedAt: new Date().toISOString(),
          lastSavedCfi: progress.cfi,
          error: undefined,
          dirty: hasNewerProgress,
          nextSaveAt: undefined,
          progress: savedProgress,
        });
      } catch (error) {
        if (generation !== this.generation) return;
        if (isSessionClosedError(error)) {
          this.closedSessionId = sessionId;
          this.input = { ...this.input, enabled: false };
          this.clearTimer();
          this.publish({
            ...this.state,
            status: "closed",
            error: "Autosave stopped because the reading session is closed.",
            dirty: false,
            nextSaveAt: undefined,
          });
          return;
        }
        const hasNewerProgress = payloadKey(this.input.progress) !== attemptedKey;
        this.publish({
          ...this.state,
          status: "error",
          error: progressErrorMessage(error),
          dirty: hasNewerProgress,
          nextSaveAt: undefined,
        });
        if (!hasNewerProgress) return;
      } finally {
        if (generation === this.generation) this.inFlightGeneration = null;
      }

      if (payloadKey(this.input.progress) === this.lastSavedPayloadKey) return;
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.scheduledPayloadKey = null;
  }

  private publish(state: ReadingProgressAutosaveState): void {
    this.state = state;
    if (this.notifyStateChanges) this.onStateChange(state);
  }
}
