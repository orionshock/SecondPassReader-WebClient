import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../../../app/offline/storage/OfflineRepositories.Types";
import {
  readerIntentResourceKey,
  type ReplaceReaderProgressIntent,
} from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";
import { canWriteLocalReaderState } from "../../../../app/offline/reader/continuity/OfflineReaderSession.Policy";
import { updateOfflineReaderBookState } from "../../../../app/offline/reader/continuity/OfflineReaderStateWrite.Coordinator";
import type { ReaderLocation, ReaderTocItem } from "../../domain/ReaderDomain.Types";
import { buildSavedReaderLocationLabel } from "../../display/ReaderLocation.Presenter";

export const OFFLINE_READING_PROGRESS_DELAY_MS = 750;

export type OfflineReadingProgress = ReplaceReaderProgressIntent["progress"];
export type OfflineReadingProgressState = {
  status: "idle" | "pending" | "saving" | "saved" | "error";
  dirty: boolean;
};

type ControllerInput = {
  initialState: OfflineReaderBookState;
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
  delayMs?: number;
  onStateChange?: (state: OfflineReadingProgressState) => void;
};

export function buildOfflineReadingProgress(input: {
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
  bookTitle?: string | null;
}): OfflineReadingProgress | null {
  const cfi = input.location?.cfi?.trim() ?? "";
  if (!cfi) return null;
  const rawProgress = input.location?.bookProgress;
  const percentage = typeof rawProgress === "number" && Number.isFinite(rawProgress)
    ? Math.max(0, Math.min(100, Math.round(rawProgress * 100)))
    : null;
  return {
    cfi,
    percentage,
    locationLabel: buildSavedReaderLocationLabel(input),
  };
}

export class OfflineReadingProgressController {
  private readonly delayMs: number;
  private readonly onStateChange: (state: OfflineReadingProgressState) => void;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private candidate: OfflineReadingProgress | null = null;
  private committedKey: string | null = null;
  private activeDrain: Promise<void> | null = null;
  private state: OfflineReadingProgressState = { status: "idle", dirty: false };

  constructor(private readonly input: ControllerInput) {
    this.delayMs = input.delayMs ?? OFFLINE_READING_PROGRESS_DELAY_MS;
    this.onStateChange = input.onStateChange ?? (() => undefined);
  }

  update(progress: OfflineReadingProgress | null): void {
    if (!progress) return;
    const previousCandidateKey = progressKey(this.candidate);
    this.candidate = progress;
    const nextKey = progressKey(progress);
    if (nextKey === this.committedKey) return;
    if (nextKey === previousCandidateKey && (this.timer !== null || this.activeDrain !== null)) return;
    this.clearTimer();
    this.publish({ status: "pending", dirty: true });
    const generation = this.generation;
    this.timer = setTimeout(() => {
      if (generation !== this.generation) return;
      this.timer = null;
      void this.startDrain(generation);
    }, this.delayMs);
  }

  flushNow(): Promise<void> {
    this.clearTimer();
    if (!this.candidate || progressKey(this.candidate) === this.committedKey) {
      return Promise.resolve();
    }
    return this.startDrain(this.generation);
  }

  pause(): void {
    this.generation += 1;
    this.clearTimer();
    this.activeDrain = null;
  }

  getState(): OfflineReadingProgressState {
    return this.state;
  }

  private startDrain(generation: number): Promise<void> {
    if (this.activeDrain) return this.activeDrain;
    const drain = this.drain(generation);
    this.activeDrain = drain;
    void drain.finally(() => {
      if (this.activeDrain === drain) this.activeDrain = null;
    });
    return drain;
  }

  private async drain(generation: number): Promise<void> {
    while (generation === this.generation) {
      const progress = this.candidate;
      if (!progress || progressKey(progress) === this.committedKey) return;
      const attemptedKey = progressKey(progress);
      this.publish({ status: "saving", dirty: true });

      try {
        // State precedes intent: an outbox write must never refer to progress that was not made durable.
        const nextState = await updateOfflineReaderBookState({
          namespaceKey: this.input.initialState.namespaceKey,
          bookId: this.input.initialState.bookId,
          fallbackState: this.input.initialState,
          repository: this.input.stateRepository,
          update: (currentState) => {
            if (!canWriteLocalReaderState(currentState.session)) {
              throw new Error("Offline Reader Session is not writable.");
            }
            return { ...currentState, progress };
          },
        });
        if (generation !== this.generation) return;

        const serverSessionId = nextState.session.kind === "server-confirmed"
          ? nextState.session.serverSessionId
          : null;
        const intents = await this.input.outboxRepository.list(nextState.namespaceKey);
        if (generation !== this.generation) return;
        const resourceKey = readerIntentResourceKey({
          type: "replace-progress",
          namespaceKey: nextState.namespaceKey,
          bookId: nextState.bookId,
          serverSessionId,
          intentRevision: 0,
          progress,
        });
        const currentRevision = intents.reduce((revision, intent) => (
          intent.type === "replace-progress" && readerIntentResourceKey(intent) === resourceKey
            ? Math.max(revision, intent.intentRevision)
            : revision
        ), 0);
        await this.input.outboxRepository.upsertIntent({
          type: "replace-progress",
          namespaceKey: nextState.namespaceKey,
          bookId: nextState.bookId,
          serverSessionId,
          intentRevision: currentRevision + 1,
          progress,
        });
        if (generation !== this.generation) return;

        this.committedKey = attemptedKey;
        const hasNewerCandidate = progressKey(this.candidate) !== attemptedKey;
        this.publish({ status: "saved", dirty: hasNewerCandidate });
        if (!hasNewerCandidate) return;
      } catch {
        if (generation === this.generation) this.publish({ status: "error", dirty: true });
        return;
      }
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private publish(state: OfflineReadingProgressState): void {
    this.state = state;
    this.onStateChange(state);
  }
}

function progressKey(progress: OfflineReadingProgress | null): string | null {
  return progress ? JSON.stringify([progress.cfi, progress.percentage, progress.locationLabel]) : null;
}
