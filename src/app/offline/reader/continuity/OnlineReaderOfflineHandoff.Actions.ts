import type {
  MarginaliaAnnotation,
  MarginaliaBookmarkUpsert,
  MarginaliaHighlightUpsert,
  MarginaliaSession,
} from "@secondpass/client";
import type {
  OfflineReaderAnnotationProjection,
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../storage/OfflineRepositories.Types";
import { updateOfflineReaderBookState } from "./OfflineReaderStateWrite.Coordinator";
import { selectOfflineReaderSession } from "./OfflineReaderSession.Policy";

export type OnlineReaderOfflineHandoffResult = {
  state: OfflineReaderBookState;
  preserveExistingProgress: boolean;
  suppressInitialProgressWrite: boolean;
};

// Establishes durable mutation state for an already-open Reader. Publication bytes stay owned
// by the mounted Reader and are not promoted to an Available offline asset.
export async function establishOnlineReaderOfflineHandoff(input: {
  namespaceKey: string;
  bookId: string;
  session: MarginaliaSession | null;
  annotations: readonly MarginaliaAnnotation[];
  progress: OfflineReaderBookState["progress"];
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
  generateLocalId?: () => string;
}): Promise<OnlineReaderOfflineHandoffResult> {
  const namespaceKey = input.namespaceKey.trim();
  const bookId = input.bookId.trim();
  if (!namespaceKey || !bookId) throw new Error("Offline Reader handoff requires account and Book identity.");

  const existing = await input.stateRepository.getBookState(namespaceKey, bookId);
  const pending = await input.outboxRepository.list(namespaceKey);
  const pendingForBook = pending.filter((intent) => intent.bookId === bookId);
  const preserveExistingProgress = Boolean(
    existing?.progress
      && pendingForBook.some((intent) => intent.type === "replace-progress"),
  );
  const fallbackState = buildFallbackState({
    namespaceKey,
    bookId,
    existing,
    session: input.session,
    annotations: input.annotations,
    progress: preserveExistingProgress ? existing?.progress ?? null : input.progress ?? existing?.progress ?? null,
    generateLocalId: input.generateLocalId,
  });
  const state = await updateOfflineReaderBookState({
    namespaceKey,
    bookId,
    fallbackState,
    repository: input.stateRepository,
    update: (current) => mergeHandoffState({
      current,
      session: input.session,
      annotations: input.annotations,
      progress: preserveExistingProgress ? current.progress : input.progress ?? current.progress,
      generateLocalId: input.generateLocalId,
    }),
  });

  if (state.session.kind === "provisional") {
    await input.outboxRepository.upsertIntent({ type: "establish-session", namespaceKey, bookId });
  }
  return {
    state,
    preserveExistingProgress,
    suppressInitialProgressWrite: preserveExistingProgress || progressMatchesServer(input.progress, input.session),
  };
}

function buildFallbackState(input: {
  namespaceKey: string;
  bookId: string;
  existing: OfflineReaderBookState | null;
  session: MarginaliaSession | null;
  annotations: readonly MarginaliaAnnotation[];
  progress: OfflineReaderBookState["progress"];
  generateLocalId?: () => string;
}): OfflineReaderBookState {
  if (input.existing) {
    return mergeHandoffState({
      current: input.existing,
      session: input.session,
      annotations: input.annotations,
      progress: input.progress,
      generateLocalId: input.generateLocalId,
    });
  }
  return {
    namespaceKey: input.namespaceKey,
    bookId: input.bookId,
    schemaVersion: 1,
    session: selectHandoffSession(null, input.session, input.generateLocalId),
    progress: input.progress,
    annotations: mapServerAnnotations(input.annotations, input.session?.id.trim() || null),
  };
}

function mergeHandoffState(input: {
  current: OfflineReaderBookState;
  session: MarginaliaSession | null;
  annotations: readonly MarginaliaAnnotation[];
  progress: OfflineReaderBookState["progress"];
  generateLocalId?: () => string;
}): OfflineReaderBookState {
  const serverSessionId = input.session?.id.trim() || null;
  const incoming = mapServerAnnotations(input.annotations, serverSessionId);
  const annotations = new Map(incoming.map((projection) => [projectionClientId(projection), projection]));
  // Existing local projections win so pending edits and tombstones survive a server bootstrap snapshot.
  for (const projection of input.current.annotations) {
    annotations.set(projectionClientId(projection), structuredClone(projection));
  }
  return {
    ...input.current,
    session: selectHandoffSession(input.current, input.session, input.generateLocalId),
    progress: input.progress,
    annotations: [...annotations.values()],
  };
}

function selectHandoffSession(
  current: OfflineReaderBookState | null,
  session: MarginaliaSession | null,
  generateLocalId?: () => string,
): OfflineReaderBookState["session"] {
  const serverSessionId = session?.id.trim() || null;
  if (serverSessionId && session) {
    return {
      kind: "server-confirmed",
      localSessionId: current?.session.localSessionId ?? createLocalSessionId(generateLocalId),
      serverSessionId,
      lastKnownServerStatus: session.status,
    };
  }
  return selectOfflineReaderSession({
    existingSession: current?.session,
    generateLocalId,
  }).session;
}

function mapServerAnnotations(
  annotations: readonly MarginaliaAnnotation[],
  serverSessionId: string | null,
): OfflineReaderAnnotationProjection[] {
  if (!serverSessionId) return [];
  return annotations.map((annotation) => ({
    status: "present",
    origin: { kind: "server-confirmed", serverSessionId },
    annotation: toUpsert(annotation),
  }));
}

function toUpsert(annotation: MarginaliaAnnotation): MarginaliaHighlightUpsert | MarginaliaBookmarkUpsert {
  if (annotation.kind === "bookmark") {
    return {
      clientId: annotation.clientId,
      kind: "bookmark",
      location: { ...annotation.location },
    };
  }
  return {
    clientId: annotation.clientId,
    kind: "highlight",
    location: { ...annotation.location },
    body: { ...annotation.body },
  };
}

function projectionClientId(projection: OfflineReaderAnnotationProjection): string {
  return projection.status === "present" ? projection.annotation.clientId : projection.clientId;
}

function createLocalSessionId(generateLocalId = generateBrowserLocalId): string {
  const generated = generateLocalId().trim();
  if (!generated) throw new Error("Offline Reader handoff requires local session identity.");
  return `local:${generated}`;
}

function progressMatchesServer(
  progress: OfflineReaderBookState["progress"],
  session: MarginaliaSession | null,
): boolean {
  const serverProgress = session?.progress;
  if (!progress || !serverProgress) return false;
  return progress.cfi.trim() === serverProgress.cfi.trim()
    && progress.locationLabel === serverProgress.locationLabel;
}

function generateBrowserLocalId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (!randomUuid) throw new Error("Secure local identity generation is unavailable.");
  return randomUuid.call(globalThis.crypto);
}
