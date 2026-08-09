import { ApiError } from "@secondpass/client";
import type { MarginaliaProgress } from "@secondpass/client";

export const READING_PROGRESS_AUTOSAVE_DELAY_MS = 3000;

export type ReadingProgressSavePayload = {
  cfi: string;
  locationLabel: string;
};

export type ReadingProgressAutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

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

  constructor(private readonly onStateChange: (state: ReadingProgressAutosaveState) => void) {}

  update(next: AutosaveInput): void {
    const sessionChanged = next.sessionId !== this.input.sessionId;
    const previousEnabled = this.input.enabled;
    const previousPayloadKey = payloadKey(this.input.progress);

    if (sessionChanged) this.resetForSession(next.sessionId);

    this.input = next;
    const nextPayloadKey = payloadKey(next.progress);
    const canSave = next.enabled && Boolean(next.sessionId && next.progress && next.saveProgress);

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
  }

  getState(): ReadingProgressAutosaveState {
    return this.state;
  }

  private resetForSession(nextSessionId: string | null): void {
    this.generation += 1;
    this.clearTimer();
    this.inFlightGeneration = null;
    this.lastSavedPayloadKey = null;
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
      void this.drain(generation);
    }, this.input.autosaveDelayMs);
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
    this.onStateChange(state);
  }
}
