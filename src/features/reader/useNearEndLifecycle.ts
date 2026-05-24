import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { ReadingOpenResponse } from "../../schemas/readingSession";
import type { LibraryBook } from "../../schemas/library";
import { findNextBookInSeries } from "../library/seriesNavigation";

export function useNearEndLifecycle(input: {
  openedBook: { book: LibraryBook } | null;
  currentProgression: number | null;
  nearEndProgressSaved: boolean;
  sessionId: string | null;
  readingOpenReplace: (next: ReadingOpenResponse) => void;
  clearLocalReaderState: () => void;
  bumpGoToStartSignal: () => void;
  resetAutosaveForSessionSwap: (nextSessionId: string) => void;
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
  onOpenBook?: (book: LibraryBook) => Promise<void>;
  debug?: boolean;
}) {
  const NEAR_END_PROGRESSION_THRESHOLD = 0.98;

  const [nearEndDismissed, setNearEndDismissed] = useState(false);
  const [closeSessionFirst, setCloseSessionFirst] = useState(false);
  const [nearEndMessage, setNearEndMessage] = useState<string | null>(null);
  const [nextBookBusy, setNextBookBusy] = useState(false);

  const nearEndActive =
    input.currentProgression != null &&
    Number.isFinite(input.currentProgression) &&
    input.currentProgression >= NEAR_END_PROGRESSION_THRESHOLD;

  const canResolveNextBook =
    Boolean(input.openedBook?.book.series?.id) &&
    input.openedBook?.book.series_index !== null &&
    input.openedBook?.book.series_index !== undefined &&
    input.openedBook?.book.series_index !== "";

  useEffect(() => {
    if (!nearEndActive) {
      setNearEndDismissed(false);
      setNearEndMessage(null);
      setCloseSessionFirst(false);
    }
  }, [nearEndActive]);

  useEffect(() => {
    // Book changes should reset any near-end dismissal/busy state so the banner behaves per-book.
    setNearEndDismissed(false);
    setNearEndMessage(null);
    setCloseSessionFirst(false);
    setNextBookBusy(false);
  }, [input.openedBook?.book.id]);

  const shouldShowNearEndBanner = nearEndActive && !nearEndDismissed && input.nearEndProgressSaved;

  const onToggleCloseSessionFirst = useCallback((checked: boolean) => {
    setCloseSessionFirst(checked);
    setNearEndMessage(null);
  }, []);

  const handleResumeNearEnd = useCallback(() => {
    setNearEndDismissed(true);
    setNearEndMessage(null);
  }, []);

  const handleGoToStart = useCallback(async () => {
    setNearEndMessage(null);
    if (!input.openedBook) return;

    if (!closeSessionFirst) {
      input.bumpGoToStartSignal();
      setNearEndMessage("Returned to start.");
      setNearEndDismissed(true);
      return;
    }

    if (!input.apiBaseUrl || !input.accessToken) {
      setNearEndMessage("Finish session + start over is not available.");
      return;
    }

    try {
      const api = new SecondPassApiClient({ serverBaseUrl: input.apiBaseUrl });
      if (input.debug) {
        // eslint-disable-next-line no-console
        console.log("[progress] start-over: request", { bookId: input.openedBook.book.id, priorSessionId: input.sessionId });
      }
      let next = await api.startOverReadingSession({
        apiBaseUrl: input.apiBaseUrl,
        accessToken: input.accessToken,
        tokenType: input.tokenType ?? "Bearer",
        bookId: input.openedBook.book.id,
      });

      const nextSessionId: string | null = (next as unknown as { session?: { id?: string } })?.session?.id ?? null;
      if (!nextSessionId) {
        // Some server variants may return a minimal payload; fall back to an explicit open to get a full session object.
        if (input.debug) {
          // eslint-disable-next-line no-console
          console.warn("[progress] start-over: response missing session.id; falling back to openReadingSession", {
            keys: next && typeof next === "object" ? Object.keys(next as object) : typeof next,
          });
        }
        next = await api.openReadingSession({
          apiBaseUrl: input.apiBaseUrl,
          accessToken: input.accessToken,
          tokenType: input.tokenType ?? "Bearer",
          bookId: input.openedBook.book.id,
        });
      }
      if (input.debug) {
        // eslint-disable-next-line no-console
        console.log("[progress] start-over: response", {
          newSessionId: (next as unknown as { session?: { id?: string } })?.session?.id ?? null,
          profileVersion: (next as unknown as { profile_version?: unknown })?.profile_version ?? null,
        });
      }

      input.readingOpenReplace(next);
      input.clearLocalReaderState();
      setNearEndDismissed(true);
      setCloseSessionFirst(false);
      setNearEndMessage("Started a new session at the beginning.");
      input.bumpGoToStartSignal();

      {
        const sid = (next as unknown as { session?: { id?: string } })?.session?.id ?? null;
        if (sid) input.resetAutosaveForSessionSwap(sid);
      }
    } catch (e) {
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "Could not start over. Your device token may be revoked or not allowed to access reading data."
          : e instanceof ApiError && e.status === 404
            ? "Could not start over. You may not have access to this book."
            : e instanceof Error
              ? e.message
              : "Failed to start over.";
      setNearEndMessage(message);
    }
  }, [
    closeSessionFirst,
    input,
  ]);

  const handleNextBook = useCallback(async () => {
    if (nextBookBusy) return;
    setNearEndMessage(null);
    if (!input.openedBook) return;

    const seriesId = input.openedBook.book.series?.id ?? null;
    const currentSeriesIndex = input.openedBook.book.series_index;
    if (!seriesId || currentSeriesIndex === null || currentSeriesIndex === undefined || currentSeriesIndex === "") {
      setNearEndMessage("No series information for this book.");
      return;
    }
    if (!input.onOpenBook) {
      setNearEndMessage("Opening next book is not available.");
      return;
    }
    if (!input.apiBaseUrl || !input.accessToken) {
      setNearEndMessage("Opening next book is not available.");
      return;
    }

    setNextBookBusy(true);
    let phase: "lookup" | "close" | "open" = "lookup";
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: input.apiBaseUrl });
      setNearEndMessage("Opening next book…");

      const seriesBooks = await api.listBooks({
        apiBaseUrl: input.apiBaseUrl,
        accessToken: input.accessToken,
        tokenType: input.tokenType ?? "Bearer",
        params: {
          series: seriesId,
          ordering: "series_index",
          pageSize: 200,
        },
      });

      const next = findNextBookInSeries(input.openedBook.book, seriesBooks.results);
      if (!next) {
        setNearEndMessage("No next book found.");
        return;
      }
      if (!next.file?.download_url) {
        setNearEndMessage("Next book has no EPUB file.");
        return;
      }

      if (closeSessionFirst && input.sessionId) {
        phase = "close";
        setNearEndMessage("Closing session…");
        await api.closeReadingSession({
          apiBaseUrl: input.apiBaseUrl,
          accessToken: input.accessToken,
          tokenType: input.tokenType ?? "Bearer",
          sessionId: input.sessionId,
        });
      }

      phase = "open";
      setNearEndMessage("Opening next book…");
      await input.onOpenBook(next);
      setNearEndMessage("Opened next book.");
      setNearEndDismissed(true);
      setCloseSessionFirst(false);
    } catch (e) {
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? phase === "close"
            ? "Could not close session. Your device token may be revoked or not allowed to modify reading data."
            : "Could not open next book. Your device token may be revoked or not allowed to access reading data."
          : e instanceof ApiError && e.status === 404
            ? phase === "close"
              ? "Could not close session. It may already be unavailable."
              : "Could not open next book. You may not have access to it."
            : e instanceof Error
              ? e.message
              : "Failed to open next book.";
      setNearEndMessage(message);
    } finally {
      setNextBookBusy(false);
    }
  }, [closeSessionFirst, input, nextBookBusy]);

  return useMemo(
    () => ({
      shouldShowNearEndBanner,
      closeSessionFirst,
      nextBookBusy,
      nearEndMessage,
      canResolveNextBook,
      onToggleCloseSessionFirst,
      handleGoToStart,
      handleNextBook,
      handleResumeNearEnd,
    }),
    [
      shouldShowNearEndBanner,
      closeSessionFirst,
      nextBookBusy,
      nearEndMessage,
      canResolveNextBook,
      onToggleCloseSessionFirst,
      handleGoToStart,
      handleNextBook,
      handleResumeNearEnd,
    ],
  );
}
