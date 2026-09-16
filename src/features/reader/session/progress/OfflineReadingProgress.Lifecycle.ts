import { useEffect, useMemo, useRef, useState } from "react";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "../../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import type { OfflineReaderBootstrap } from "../../Reader.Types";
import type { ReaderLocation, ReaderTocItem } from "../../domain/ReaderDomain.Types";
import {
  createOfflineReaderProgressPersistence,
  type OfflineReadingProgress,
} from "../../../../app/offline/reader/progress/OfflineReaderProgressPersistence.Actions";
import {
  buildOfflineReadingProgress,
  OfflineReadingProgressController,
  type OfflineReadingProgressState,
} from "./OfflineReadingProgress.Controller";

const OFFLINE_READING_PROGRESS_EXIT_FLUSH_TIMEOUT_MS = 1500;

type OfflineProgressRepositories = Pick<
  IndexedDbOfflineRepositories<Blob>,
  "readerState" | "readerOutbox" | "close"
>;

const openProductionRepositories = () => openIndexedDbOfflineRepositories<Blob>();

export function useOfflineReadingProgress(input: {
  bootstrap: OfflineReaderBootstrap | null;
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
  bookTitle?: string | null;
  openRepositories?: () => Promise<OfflineProgressRepositories>;
}) {
  const [state, setState] = useState<OfflineReadingProgressState>({ status: "idle", dirty: false });
  const controllerRef = useRef<OfflineReadingProgressController | null>(null);
  const latestProgressRef = useRef<OfflineReadingProgress | null>(null);
  const suppressedInitialProgressRef = useRef<{
    bootstrap: OfflineReaderBootstrap;
    progressKey: string | null;
  } | null>(null);
  const progress = useMemo(() => buildOfflineReadingProgress({
    location: input.location,
    toc: input.toc,
    bookTitle: input.bookTitle,
  }), [input.bookTitle, input.location, input.toc]);
  latestProgressRef.current = progress;

  const namespaceKey = input.bootstrap?.continuity.namespaceKey ?? null;
  const bookId = input.bootstrap?.continuity.bookId ?? null;
  const openRepositories = input.openRepositories ?? openProductionRepositories;

  useEffect(() => {
    const bootstrap = input.bootstrap;
    if (!bootstrap || !namespaceKey || !bookId) return;
    let cancelled = false;
    let repositories: OfflineProgressRepositories | null = null;
    let controller: OfflineReadingProgressController | null = null;

    const flushForPageExit = () => {
      void controller?.flushNow();
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushForPageExit();
    };

    void (async () => {
      try {
        repositories = await openRepositories();
        if (cancelled) {
          repositories.close();
          return;
        }
        controller = new OfflineReadingProgressController({
          persistence: createOfflineReaderProgressPersistence({
            namespaceKey,
            bookId,
            stateRepository: repositories.readerState,
            outboxRepository: repositories.readerOutbox,
          }),
          onStateChange: (nextState) => {
            if (!cancelled) setState(nextState);
          },
        });
        controllerRef.current = controller;
        if (bootstrap.suppressInitialProgressWrite) {
          suppressedInitialProgressRef.current = {
            bootstrap,
            progressKey: offlineProgressKey(latestProgressRef.current),
          };
        } else {
          controller.update(latestProgressRef.current);
        }
        window.addEventListener("pagehide", flushForPageExit);
        document.addEventListener("visibilitychange", flushWhenHidden);
      } catch {
        if (!cancelled) setState({ status: "error", dirty: true });
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", flushForPageExit);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      if (controllerRef.current === controller) controllerRef.current = null;
      if (suppressedInitialProgressRef.current?.bootstrap === bootstrap) {
        suppressedInitialProgressRef.current = null;
      }
      if (!controller || !repositories) return;
      queueMicrotask(() => {
        void settleOfflineProgressExit(controller!).finally(() => {
          controller!.pause();
          repositories!.close();
        });
      });
    };
  }, [bookId, input.bootstrap, namespaceKey, openRepositories]);

  useEffect(() => {
    const suppressed = suppressedInitialProgressRef.current;
    if (suppressed?.bootstrap === input.bootstrap) {
      if (suppressed.progressKey === offlineProgressKey(progress)) return;
      suppressedInitialProgressRef.current = null;
    }
    controllerRef.current?.update(progress);
  }, [input.bootstrap, progress]);

  return state;
}

function offlineProgressKey(progress: OfflineReadingProgress | null): string | null {
  return progress
    ? JSON.stringify([progress.cfi, progress.percentage, progress.locationLabel])
    : null;
}

export async function settleOfflineProgressExit(
  controller: Pick<OfflineReadingProgressController, "flushNow">,
  timeoutMs = OFFLINE_READING_PROGRESS_EXIT_FLUSH_TIMEOUT_MS,
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([controller.flushNow(), timeout]);
  } catch {
    // Reader teardown must not reject because local persistence failed.
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
