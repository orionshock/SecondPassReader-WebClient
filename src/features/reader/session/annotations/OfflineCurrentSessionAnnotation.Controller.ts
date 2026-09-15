import type {
  MarginaliaAnnotation,
  MarginaliaHighlight,
  MarginaliaHighlightColor,
} from "@secondpass/client";
import type {
  OfflineReaderAnnotationProjection,
  OfflineReaderBookState,
} from "../../../../app/offline/storage/OfflineRepositories.Types";
import { canWriteLocalReaderState } from "../../../../app/offline/reader/continuity/OfflineReaderSession.Policy";
import type { LocalReaderAnnotationCommitRepository } from "../../../../app/offline/reader/annotations/LocalReaderAnnotationCommit.Repository";
import { applyAnnotationMutation, projectionClientId } from "../../../../app/offline/reader/annotations/ReaderAnnotationDesiredState.Policy";
import type { CurrentSessionAnnotationMutation } from "./CurrentSessionAnnotation.Types";
import { debugWarn } from "../../../../lib/debug/DebugLogger.Diagnostics";
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
  annotationCommitRepository: LocalReaderAnnotationCommitRepository;
  generateClientId?: () => string;
  onAnnotationsChange?: (annotations: MarginaliaAnnotation[]) => void;
  onStateChange?: (state: OfflineAnnotationPersistenceState) => void;
};

export class OfflineCurrentSessionAnnotationController {
  private projections: OfflineReaderAnnotationProjection[];
  private pendingMutations: Array<{ mutation: CurrentSessionAnnotationMutation; expectedProjection: OfflineReaderAnnotationProjection | undefined }> = [];
  private revision: number;
  private queue: Promise<void> = Promise.resolve();
  private state: OfflineAnnotationPersistenceState = { status: "idle", dirty: false };

  constructor(private readonly input: ControllerInput) {
    this.projections = structuredClone(input.initialState.annotations);
    this.revision = input.initialState.annotationRevision;
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
    await this.commitMutation(commit.operation);
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
    await this.commitMutation(operation);
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
      await this.commitMutation(operation);
      return { ok: true, action: "created" };
    } catch {
      return { ok: false, reason: "mutation-failed", error: new Error("Offline bookmark was not saved.") };
    }
  }

  async removeById(annotationId: string): Promise<void> {
    this.assertWritable();
    const projection = this.findProjectionById(annotationId);
    if (!projection || projection.status !== "present") return;
    await this.commitMutation({ action: "delete", clientId: projection.annotation.clientId });
  }

  flush(): Promise<void> {
    return this.enqueueDrain();
  }

  private commitMutation(mutation: CurrentSessionAnnotationMutation): Promise<void> {
    const clientId = mutation.action === "upsert" ? mutation.annotation.clientId : mutation.clientId;
    const expectedProjection = this.findProjection(clientId);
    this.projections = applyAnnotationMutation(this.projections, mutation, expectedProjection?.origin ?? { kind: "local-unconfirmed" });
    this.pendingMutations.push(structuredClone({ mutation, expectedProjection }));
    this.publishAnnotations();
    this.publishState({ status: "saving", dirty: true });
    return this.enqueueDrain().catch(() => { throw new Error("Offline annotation was not saved."); });
  }

  private enqueueDrain(): Promise<void> {
    const operation = this.queue.then(() => this.drain());
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async drain(): Promise<void> {
    if (this.pendingMutations.length === 0) return;
    try {
      this.assertWritable();
      while (this.pendingMutations.length > 0) {
        const pending = this.pendingMutations[0];
        const result = await this.input.annotationCommitRepository.commit({
          kind: "author",
          namespaceKey: this.input.initialState.namespaceKey,
          bookId: this.input.initialState.bookId,
          authority: this.input.initialState.session,
          expectedRevision: this.revision,
          ...pending,
        });
        if (result.status !== "committed") throw new Error(`Local annotation commit: ${result.status}`);
        this.revision = result.state.annotationRevision;
        this.pendingMutations.shift();
        this.projections = this.pendingMutations.reduce((annotations, pending) => applyAnnotationMutation(
          annotations, pending.mutation, pending.expectedProjection?.origin ?? { kind: "local-unconfirmed" },
        ), result.state.annotations);
        this.publishAnnotations();
      }
      this.publishState({ status: "saved", dirty: false });
    } catch (error) {
      debugWarn("reader", "annotation commit failed", { bookId: this.input.initialState.bookId, error });
      this.publishState({ status: "error", dirty: true });
      throw new Error("Offline annotation persistence failed.");
    }
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
