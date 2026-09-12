import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, type BookDetail, type SecondPassClient } from "@secondpass/client";
import { openBookForReader } from "../features/library/LibraryBookOpen.Actions";
import { releaseOpenedBook, resolveReaderOpenCompletion } from "../features/reader/ReaderOpen.Lifecycle";
import { saveReaderReturnTarget } from "../features/reader/ReaderReturnTarget.Store";
import type { OpenedBook, ReaderReturnTarget } from "../features/reader/Reader.Types";
import type { ConnectionProfile } from "../storage/ConnectionProfiles.Store";
import type { AppWorkflowStep } from "./AppWorkflow.Policy";
import type { AppRoute } from "./AppNavigation.Router";
import { navigateTo } from "./AppNavigation.Router";
import { debugLog, debugWarn } from "../lib/debug/DebugLogger.Diagnostics";
import {
  getBrowserConnectivitySnapshot,
  subscribeToBrowserConnectivity,
} from "./connectivity/BrowserConnectivity.State";
import { buildOfflineCacheNamespace } from "./offline/namespace/OfflineCacheNamespace.Policy";
import {
  loadOfflineReaderBookMetadata,
  openOfflineBookForReader,
} from "./offline/reader/continuity/OfflineReaderOpen.Actions";
import { openIndexedDbOfflineRepositories } from "./offline/storage/IndexedDbOfflineRepositories.Factory";

export function useAppReaderOpenController({
  route,
  workflowStep,
  profile,
  spl,
  reportAuthorizationFailure,
}: {
  route: AppRoute | null;
  workflowStep: AppWorkflowStep;
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  reportAuthorizationFailure: (error: unknown) => void;
}) {
  const [openedBook, setOpenedBook] = useState<OpenedBook | null>(null);
  const [readerRestoreError, setReaderRestoreError] = useState<string | null>(null);
  const [readerRestoreAttempt, setReaderRestoreAttempt] = useState(0);
  const activeOpenedBookRef = useRef<OpenedBook | null>(null);
  const openingBookRef = useRef<string | null>(null);
  const navigationSequenceRef = useRef(0);
  const preparedOfflineBookRef = useRef<BookDetail | null>(null);
  const routeRef = useRef<AppRoute | null>(route);
  routeRef.current = route;
  const connectivity = useSyncExternalStore(
    subscribeToBrowserConnectivity,
    getBrowserConnectivitySnapshot,
    getBrowserConnectivitySnapshot,
  );

  const closeReader = useCallback(() => {
    debugLog("reader", "reader closed");
    const active = activeOpenedBookRef.current;
    activeOpenedBookRef.current = null;
    releaseOpenedBook(active);
    setOpenedBook(null);
    openingBookRef.current = null;
    preparedOfflineBookRef.current = null;
  }, []);

  const retryReaderRestore = useCallback(() => {
    // Force re-run of the reader restore effect by clearing the in-flight guard.
    openingBookRef.current = null;
    setReaderRestoreError(null);
    setReaderRestoreAttempt((attempt) => attempt + 1);
  }, []);

  const openReaderFromBookDetail = useCallback((book: BookDetail, returnTarget: ReaderReturnTarget) => {
    preparedOfflineBookRef.current = book;
    saveReaderReturnTarget(book.id, returnTarget);
    navigateTo({ kind: "reader", bookId: String(book.id) });
  }, []);

  // Bump a sequence number on any route change so async opens can be cancelled logically.
  useEffect(() => {
    navigationSequenceRef.current += 1;
  }, [route]);

  useEffect(() => {
    // Leaving reader route closes reader state (do not keep blobs around).
    if (!openedBook) return;
    if (route?.kind === "reader") return;
    closeReader();
  }, [closeReader, openedBook, route?.kind]);

  useEffect(() => {
    // Reader route restore/open: on reload (or direct navigation) open the requested book.
    if (workflowStep !== "library_home") return;
    if (!route || route.kind !== "reader") return;
    if (!profile) return;
    if (connectivity !== "offline" && (!profile.apiBaseUrl || !profile.accessToken || !spl)) return;

    const requestedBookId = route.bookId;
    if (openedBook?.book?.id === requestedBookId) return;
    if (openingBookRef.current === requestedBookId) return;

    setReaderRestoreError(null);
    openingBookRef.current = requestedBookId;

    // React dev StrictMode intentionally mounts/unmounts components twice to detect unsafe effects.
    // Guard async work so the first mount's async does not "win" or interfere with the second mount.
    let cancelled = false;

    void (async () => {
      const sequence = navigationSequenceRef.current;
      try {
        const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<T>((_resolve, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
          });
          try {
            return await Promise.race([promise, timeoutPromise]);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        };

        let opened: OpenedBook;
        if (connectivity === "offline") {
          try {
            const namespace = buildOfflineCacheNamespace({
              serverBaseUrl: profile.serverBaseUrl,
              accountProfileId: profile.verifiedUser?.profileId,
            });
            if (!namespace) throw new OfflineReaderAdmissionError();

            const repositories = await openIndexedDbOfflineRepositories<Blob>();
            try {
              const preparedBook = preparedOfflineBookRef.current;
              const book = preparedBook && String(preparedBook.id) === requestedBookId
                ? preparedBook
                : await loadOfflineReaderBookMetadata({
                    namespaceKey: namespace.key,
                    bookId: requestedBookId,
                    repository: repositories.projections,
                  });
              if (!book) throw new OfflineReaderAdmissionError();
              const result = await openOfflineBookForReader({
                namespace,
                book,
                assetRepository: repositories.publicationAssets,
                readerStateRepository: repositories.readerState,
                outboxRepository: repositories.readerOutbox,
              });
              if (result.status !== "opened") throw new OfflineReaderAdmissionError();
              opened = result.openedBook;
            } finally {
              repositories.close();
            }
          } catch {
            throw new OfflineReaderAdmissionError();
          }
        } else {
          const onlineSpl = spl!;
          const book = await withTimeout(
            onlineSpl.library.books.get(requestedBookId),
            30_000,
            "Loading book details",
          );
          if (cancelled) return;
          if (sequence !== navigationSequenceRef.current) return;
          opened = await openBookForReader({ spl: onlineSpl, book });
        }
        const currentRoute = routeRef.current;
        const currentOpened = resolveReaderOpenCompletion(
          opened,
          !cancelled
            && sequence === navigationSequenceRef.current
            && currentRoute?.kind === "reader"
            && currentRoute.bookId === requestedBookId,
        );
        if (!currentOpened) return;

        // If the user navigated away from the reader route while this book was opening, do not re-open it.
        if (route?.kind !== "reader") {
          releaseOpenedBook(currentOpened);
          return;
        }
        const previous = activeOpenedBookRef.current;
        preparedOfflineBookRef.current = null;
        activeOpenedBookRef.current = currentOpened;
        releaseOpenedBook(previous);
        setOpenedBook(currentOpened);
        navigateTo({ kind: "reader", bookId: String(currentOpened.book.id), search: route.search });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof OfflineReaderAdmissionError) {
          setReaderRestoreError("This book is not available offline.");
          return;
        }
        debugWarn("reader", "Book could not be opened in Reader", { bookId: requestedBookId, error });
        reportAuthorizationFailure(error);
        const message =
          error instanceof ApiError && error.status === 404
            ? "That book could not be found or you do not have access to it."
            : "Couldn't open the Book. Return to Home and try again.";
        setReaderRestoreError(message);
        navigateTo({ kind: "home" });
      } finally {
        if (openingBookRef.current === requestedBookId) openingBookRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      // In React StrictMode (dev), effects are mounted/unmounted twice. If we leave the guard set
      // during the simulated unmount, the second mount run will be incorrectly blocked.
      if (openingBookRef.current === requestedBookId) {
        openingBookRef.current = null;
      }
    };
  }, [
    openedBook?.book?.id,
    connectivity,
    profile,
    readerRestoreAttempt,
    reportAuthorizationFailure,
    route,
    spl,
    workflowStep,
  ]);

  return {
    openedBook,
    readerRestoreError,
    closeReader,
    openReaderFromBookDetail,
    retryReaderRestore,
  };
}

class OfflineReaderAdmissionError extends Error {}
