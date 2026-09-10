import type { MarginaliaBootstrap } from "@secondpass/client";
import type {
  OfflineReaderBookState,
  OfflineReaderStateRepository,
  ReaderOutboxRepository,
} from "../../storage/OfflineRepositories.Types";
import { classifyOfflineDeliveryFailure } from "../retry/OfflineRetry.Policy";
import { updateOfflineReaderBookState } from "../continuity/OfflineReaderStateWrite.Coordinator";
import { readerIntentResourceKey } from "../outbox/ReaderOutbox.Policy";

export type ReaderSessionAuthority = {
  getActiveSession(bookId: string): Promise<MarginaliaBootstrap>;
  open(bookId: string): Promise<MarginaliaBootstrap>;
};

export type OfflineReaderSessionReconciliationResult =
  | {
      status: "resolved";
      source: "active-session" | "open";
      state: OfflineReaderBookState;
      establishIntentRemoved: boolean;
    }
  | { status: "no-local-state" }
  | { status: "retry-later"; retryAfterMs: number | null }
  | { status: "reauthenticate" }
  | { status: "refresh-authority" }
  | { status: "unavailable" }
  | { status: "failed" };

type ReconciliationInput = {
  namespaceKey: string;
  bookId: string;
  authority: ReaderSessionAuthority;
  stateRepository: OfflineReaderStateRepository;
  outboxRepository: ReaderOutboxRepository;
};

const activeReconciliations = new Map<string, Promise<OfflineReaderSessionReconciliationResult>>();

export function reconcileOfflineReaderSessionAuthority(
  input: ReconciliationInput,
): Promise<OfflineReaderSessionReconciliationResult> {
  const namespaceKey = input.namespaceKey.trim();
  const bookId = input.bookId.trim();
  if (!namespaceKey || !bookId) return Promise.resolve({ status: "unavailable" });

  const scopeKey = JSON.stringify([namespaceKey, bookId]);
  const active = activeReconciliations.get(scopeKey);
  if (active) return active;

  const operation = reconcile({ ...input, namespaceKey, bookId });
  activeReconciliations.set(scopeKey, operation);
  const clear = () => {
    if (activeReconciliations.get(scopeKey) === operation) activeReconciliations.delete(scopeKey);
  };
  void operation.then(clear, clear);
  return operation;
}

async function reconcile(
  input: ReconciliationInput,
): Promise<OfflineReaderSessionReconciliationResult> {
  let existing: OfflineReaderBookState | null;
  try {
    existing = await input.stateRepository.getBookState(input.namespaceKey, input.bookId);
  } catch {
    return { status: "failed" };
  }
  if (!existing) return { status: "no-local-state" };

  let source: "active-session" | "open";
  let resolvedSession: NonNullable<MarginaliaBootstrap["session"]>;
  try {
    const activeBootstrap = await input.authority.getActiveSession(input.bookId);
    const activeSession = getWritableSession(activeBootstrap, input.bookId);
    source = activeSession ? "active-session" : "open";
    const bootstrap = activeSession ? activeBootstrap : await input.authority.open(input.bookId);
    const writableSession = getWritableSession(bootstrap, input.bookId);
    if (!writableSession) return { status: "refresh-authority" };
    resolvedSession = writableSession;
  } catch (error) {
    return mapAuthorityFailure(error);
  }

  let state: OfflineReaderBookState;
  try {
    state = await updateOfflineReaderBookState({
      namespaceKey: input.namespaceKey,
      bookId: input.bookId,
      fallbackState: existing,
      repository: input.stateRepository,
      update: (current) => ({
        ...current,
        session: {
          kind: "server-confirmed",
          localSessionId: current.session.localSessionId,
          serverSessionId: resolvedSession.id,
          lastKnownServerStatus: "active",
        },
      }),
    });
  } catch {
    return { status: "failed" };
  }

  let establishIntentRemoved = false;
  try {
    establishIntentRemoved = await input.outboxRepository.remove(
      input.namespaceKey,
      readerIntentResourceKey({
        type: "establish-session",
        namespaceKey: input.namespaceKey,
        bookId: input.bookId,
      }),
      null,
    );
  } catch {
    // The authority binding is durable; a repeated establish operation converges through open.
  }

  return { status: "resolved", source, state, establishIntentRemoved };
}

function getWritableSession(bootstrap: MarginaliaBootstrap, bookId: string) {
  const session = bootstrap.session;
  return bootstrap.context.book.id === bookId
    && session?.status === "active"
    && session.id.trim()
    ? session
    : null;
}

function mapAuthorityFailure(error: unknown): OfflineReaderSessionReconciliationResult {
  const failure = classifyOfflineDeliveryFailure(
    error instanceof TypeError ? { kind: "network" } : error,
  );
  switch (failure.classification) {
    case "retry-later":
      return { status: "retry-later", retryAfterMs: failure.retryAfterMs };
    case "reauthenticate":
      return { status: "reauthenticate" };
    case "refresh-authority":
    case "session-closed":
      return { status: "refresh-authority" };
    case "terminal-request":
      return { status: "unavailable" };
    case "unknown":
      return { status: "failed" };
  }
}
