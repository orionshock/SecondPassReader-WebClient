import { useEffect, useRef, useState } from "react";
import type { MarginaliaAnnotation, MarginaliaBootstrap } from "@secondpass/client";
import type { BrowserConnectivityStatus } from "../../../app/connectivity/BrowserConnectivity.State";
import {
  establishOnlineReaderOfflineHandoff,
} from "../../../app/offline/reader/continuity/OnlineReaderOfflineHandoff.Actions";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";
import type { OfflineReaderBootstrap } from "../Reader.Types";
import type { OfflineReadingProgress } from "../../../app/offline/reader/progress/OfflineReaderProgressPersistence.Actions";

type HandoffRepositories = Pick<
  IndexedDbOfflineRepositories<Blob>,
  "readerState" | "readerOutbox" | "close"
>;

export type OnlineReaderOfflineHandoffState =
  | { status: "inactive" | "loading" | "error"; bootstrap: null }
  | { status: "ready"; bootstrap: OfflineReaderBootstrap };

type HandoffEntry = OnlineReaderOfflineHandoffState & { identity: string };

const openProductionRepositories = () => openIndexedDbOfflineRepositories<Blob>();

// Connectivity may change mutation ownership for one mounted Reader, but never its engine or publication lifetime.
export function useOnlineReaderOfflineHandoff(input: {
  source: "online" | "offline";
  connectivity: BrowserConnectivityStatus;
  namespaceKey: string | null;
  bookId: string;
  serverBootstrap: MarginaliaBootstrap | null;
  readAnnotations: () => readonly MarginaliaAnnotation[];
  progress: OfflineReadingProgress | null;
  openRepositories?: () => Promise<HandoffRepositories>;
}): OnlineReaderOfflineHandoffState {
  const identity = input.source === "online" && input.namespaceKey?.trim() && input.bookId.trim()
    ? JSON.stringify([input.namespaceKey.trim(), input.bookId.trim()])
    : "";
  const [entry, setEntry] = useState<HandoffEntry>({ identity: "", status: "inactive", bootstrap: null });
  const progressRef = useRef(input.progress);
  const activatedIdentityRef = useRef("");
  progressRef.current = input.progress;
  const openRepositories = input.openRepositories ?? openProductionRepositories;

  useEffect(() => {
    // A successful handoff stays local-first for this mounted Book; reconnect is handled by normal replay.
    if (!identity || activatedIdentityRef.current === identity) return;
    const namespaceKey = input.namespaceKey?.trim() ?? "";
    const bookId = input.bookId.trim();
    if (
      input.source !== "online"
      || input.connectivity !== "offline"
      || !namespaceKey
      || !bookId
      || !input.serverBootstrap
      || input.serverBootstrap.context.book.id !== bookId
    ) {
      return;
    }

    let cancelled = false;
    let repositories: HandoffRepositories | null = null;
    setEntry({ identity, status: "loading", bootstrap: null });
    void (async () => {
      try {
        repositories = await openRepositories();
        if (cancelled) return;
        const result = await establishOnlineReaderOfflineHandoff({
          namespaceKey,
          bookId,
          session: input.serverBootstrap!.session,
          annotations: input.readAnnotations(),
          progress: progressRef.current,
          stateRepository: repositories.readerState,
          outboxRepository: repositories.readerOutbox,
        });
        if (cancelled) return;
        activatedIdentityRef.current = identity;
        setEntry({
          identity,
          status: "ready",
          bootstrap: {
            kind: "local",
            continuity: result.state,
            serverWritesAllowed: false,
            suppressInitialProgressWrite: result.suppressInitialProgressWrite,
          },
        });
      } catch (error) {
        if (cancelled) return;
        debugWarn("reader", "durable offline authoring handoff could not be established", {
          bookId,
          error,
        });
        setEntry({ identity, status: "error", bootstrap: null });
      } finally {
        repositories?.close();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identity, input.bookId, input.connectivity, input.namespaceKey, input.readAnnotations, input.serverBootstrap, input.source, openRepositories]);

  if (entry.identity !== identity) return { status: "inactive", bootstrap: null };
  const { identity: _identity, ...state } = entry;
  return state;
}
