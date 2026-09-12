import type {
  MarginaliaAnnotation,
  MarginaliaBookmarkUpsert,
  MarginaliaHighlight,
  MarginaliaHighlightColor,
  MarginaliaHighlightUpsert,
} from "@secondpass/client";
import type {
  OfflineReaderAnnotationProjection,
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../../../app/offline/storage/OfflineRepositories.Types";
import { canWriteLocalReaderState } from "../../../../app/offline/reader/continuity/OfflineReaderSession.Policy";
import { updateOfflineReaderBookState } from "../../../../app/offline/reader/continuity/OfflineReaderStateWrite.Coordinator";
import {
  coalesceReaderIntent,
  readerIntentResourceKey,
  type ReaderAnnotationOrigin,
  type ReaderOutboxIntent,
} from "../../../../app/offline/reader/outbox/ReaderOutbox.Policy";
import type { ReaderBookmark } from "../../annotations/ReaderBookmark.Mapper";
import type { ReaderSelection } from "../../domain/ReaderDomain.Types";
import type { ReaderLocation } from "../../domain/ReaderDomain.Types";
import {
  buildBookmarkUpsert,
  buildCurrentSessionHighlightCommit,
  buildHighlightUpdate,
} from "../ReadingSessionMarginalia.Actions";
import type { ReaderBookmarkMutationResult } from "./CurrentSessionBookmark.Actions";
import { mapOfflineReaderAnnotations } from "./OfflineReaderAnnotations.Mapper";

export type OfflineAnnotationPersistenceState = {
  status: "idle" | "saving" | "saved" | "error";
  dirty: boolean;
};

type ControllerInput = {
  initialState: OfflineReaderBookState;
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
  generateClientId?: () => string;
  onAnnotationsChange?: (annotations: MarginaliaAnnotation[]) => void;
  onStateChange?: (state: OfflineAnnotationPersistenceState) => void;
};

export class OfflineCurrentSessionAnnotationController {
  private projections: OfflineReaderAnnotationProjection[];
  private pendingIntents: ReaderOutboxIntent[] = [];
  private queue: Promise<void> = Promise.resolve();
  private state: OfflineAnnotationPersistenceState = { status: "idle", dirty: false };

  constructor(private readonly input: ControllerInput) {
    this.projections = structuredClone(input.initialState.annotations);
  }

  canMutate(): boolean {
    return canWriteLocalReaderState(this.input.initialState.session);
  }

  getAnnotations(): MarginaliaAnnotation[] {
    return mapOfflineReaderAnnotations(this.projections);
  }

  getState(): OfflineAnnotationPersistenceState {
    return this.state;
  }

  async createHighlight(input: {
    selection: ReaderSelection;
    color: string;
    note?: string;
    locationLabel?: string;
  }): Promise<void> {
    this.assertWritable();
    const selection = input.selection;
    if (!selection?.cfiRange || !selection.text) throw new Error("Missing selection.");
    const current = this.getAnnotations();
    const commit = buildCurrentSessionHighlightCommit({
      currentAnnotations: current,
      createClientId: () => this.generateClientId(),
      cfi: selection.cfiRange,
      locationLabel: input.locationLabel,
      text: selection.text,
      color: input.color as MarginaliaHighlightColor,
      note: input.note,
      prefix: selection.quotePrefix,
      suffix: selection.quoteSuffix,
    });
    if (commit.operation.action !== "upsert") throw new Error("Invalid local highlight operation.");
    const existing = this.findProjection(commit.operation.annotation.clientId);
    await this.applyUpsert(commit.operation.annotation, existing?.origin ?? { kind: "local-unconfirmed" });
  }

  async updateHighlight(annotationId: string, update: { note: string; color: string }): Promise<void> {
    this.assertWritable();
    const projection = this.findProjectionById(annotationId);
    if (!projection || projection.status !== "present" || projection.annotation.kind !== "highlight") {
      throw new Error("Highlight not found.");
    }
    const raw = this.getAnnotations().find(
      (annotation): annotation is MarginaliaHighlight => annotation.id === annotationId && annotation.kind === "highlight",
    );
    if (!raw) throw new Error("Highlight not found.");
    const operation = buildHighlightUpdate(raw, {
      color: (update.color.trim() || raw.body.color || "yellow") as MarginaliaHighlightColor,
      note: update.note,
    });
    if (operation.action !== "upsert") throw new Error("Invalid local highlight operation.");
    await this.applyUpsert(operation.annotation, projection.origin);
  }

  async toggleBookmark(input: {
    location: ReaderLocation | null;
    locationLabel?: string;
    currentBookmark: ReaderBookmark | null;
  }): Promise<ReaderBookmarkMutationResult> {
    if (!this.canMutate()) return { ok: false, reason: "not-allowed" };
    const cfi = input.location?.cfi?.trim() ?? "";
    if (!cfi) return { ok: false, reason: "missing-state" };
    try {
      if (input.currentBookmark) {
        await this.removeById(input.currentBookmark.id);
        return { ok: true, action: "deleted" };
      }
      const operation = buildBookmarkUpsert({
        clientId: this.generateClientId(),
        cfi,
        locationLabel: input.locationLabel,
      });
      if (operation.action !== "upsert") throw new Error("Invalid local bookmark operation.");
      await this.applyUpsert(operation.annotation, { kind: "local-unconfirmed" });
      return { ok: true, action: "created" };
    } catch {
      return { ok: false, reason: "mutation-failed", error: new Error("Offline bookmark was not saved.") };
    }
  }

  async removeById(annotationId: string): Promise<void> {
    this.assertWritable();
    const projection = this.findProjectionById(annotationId);
    if (!projection || projection.status !== "present") return;
    const clientId = projection.annotation.clientId;
    this.projections = projection.origin.kind === "local-unconfirmed"
      ? this.projections.filter((item) => projectionClientId(item) !== clientId)
      : this.projections.map((item) => projectionClientId(item) === clientId
        ? { status: "deleted", origin: projection.origin, clientId }
        : item);
    this.publishAnnotations();
    await this.enqueueIntent({
      type: "delete-annotation",
      ...this.intentScope(),
      intentRevision: 0,
      origin: projection.origin,
      clientId,
    });
  }

  flush(): Promise<void> {
    return this.enqueueDrain();
  }

  private async applyUpsert(
    annotation: MarginaliaHighlightUpsert | MarginaliaBookmarkUpsert,
    origin: ReaderAnnotationOrigin,
  ): Promise<void> {
    const next: OfflineReaderAnnotationProjection = { status: "present", origin, annotation };
    const index = this.projections.findIndex((item) => projectionClientId(item) === annotation.clientId);
    this.projections = index < 0
      ? [...this.projections, next]
      : this.projections.map((item, itemIndex) => itemIndex === index ? next : item);
    this.publishAnnotations();
    await this.enqueueIntent({
      type: "upsert-annotation",
      ...this.intentScope(),
      intentRevision: 0,
      origin,
      annotation,
    });
  }

  private enqueueIntent(intent: ReaderOutboxIntent): Promise<void> {
    this.pendingIntents = coalescePendingIntents(this.pendingIntents, intent);
    this.publishState({ status: "saving", dirty: true });
    return this.enqueueDrain().catch(() => {
      throw new Error("Offline annotation was not saved.");
    });
  }

  private enqueueDrain(): Promise<void> {
    const operation = this.queue.then(() => this.drain());
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async drain(): Promise<void> {
    if (!this.canMutate()) return;
    try {
      // State precedes intent so a persisted mutation is always recoverable even if outbox storage fails.
      const savedState = await updateOfflineReaderBookState({
        namespaceKey: this.input.initialState.namespaceKey,
        bookId: this.input.initialState.bookId,
        fallbackState: this.input.initialState,
        repository: this.input.stateRepository,
        update: (current) => {
          if (!canWriteLocalReaderState(current.session)) throw new Error("Offline Reader Session is not writable.");
          return { ...current, annotations: structuredClone(this.projections) };
        },
      });
      while (this.pendingIntents.length > 0) {
        const pending = this.pendingIntents[0];
        const intent = await this.withNextRevision(pending, savedState.namespaceKey);
        await this.input.outboxRepository.upsertIntent(intent);
        if (this.pendingIntents[0] === pending) this.pendingIntents.shift();
      }
      this.publishState({ status: "saved", dirty: false });
    } catch {
      this.publishState({ status: "error", dirty: true });
      throw new Error("Offline annotation persistence failed.");
    }
  }

  private async withNextRevision(intent: ReaderOutboxIntent, namespaceKey: string): Promise<ReaderOutboxIntent> {
    if (!("intentRevision" in intent)) return intent;
    const key = readerIntentResourceKey(intent);
    const existing = await this.input.outboxRepository.list(namespaceKey);
    const revision = existing.reduce((highest, candidate) => (
      readerIntentResourceKey(candidate) === key && "intentRevision" in candidate
        ? Math.max(highest, candidate.intentRevision)
        : highest
    ), 0);
    return { ...intent, intentRevision: revision + 1 };
  }

  private intentScope() {
    return {
      namespaceKey: this.input.initialState.namespaceKey,
      bookId: this.input.initialState.bookId,
      serverSessionId: this.input.initialState.session.kind === "server-confirmed"
        ? this.input.initialState.session.serverSessionId
        : null,
    };
  }

  private findProjection(clientId: string) {
    return this.projections.find((item) => projectionClientId(item) === clientId);
  }

  private findProjectionById(annotationId: string) {
    return this.projections.find((item) => {
      const clientId = projectionClientId(item);
      return annotationId === clientId || annotationId === `local:${clientId}`;
    });
  }

  private assertWritable(): void {
    if (!this.canMutate()) throw new Error("This offline Reader Session cannot be modified.");
  }

  private generateClientId(): string {
    const generated = (this.input.generateClientId ?? (() => globalThis.crypto.randomUUID()))().trim();
    if (!generated) throw new Error("Annotation client identity is unavailable.");
    return generated;
  }

  private publishAnnotations(): void {
    this.input.onAnnotationsChange?.(this.getAnnotations());
  }

  private publishState(state: OfflineAnnotationPersistenceState): void {
    this.state = state;
    this.input.onStateChange?.(state);
  }
}

function projectionClientId(projection: OfflineReaderAnnotationProjection): string {
  return projection.status === "present" ? projection.annotation.clientId : projection.clientId;
}

function coalescePendingIntents(
  existing: readonly ReaderOutboxIntent[],
  incoming: ReaderOutboxIntent,
): ReaderOutboxIntent[] {
  const resourceKey = readerIntentResourceKey(incoming);
  const hasMatching = existing.some((intent) => readerIntentResourceKey(intent) === resourceKey);
  const coalesced = coalesceReaderIntent(existing, incoming);
  if (
    incoming.type === "delete-annotation"
    && incoming.origin.kind === "local-unconfirmed"
    && !hasMatching
  ) {
    return [...existing, incoming];
  }
  return coalesced;
}
