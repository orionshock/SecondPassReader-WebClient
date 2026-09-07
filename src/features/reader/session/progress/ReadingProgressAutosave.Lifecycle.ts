import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { MarginaliaProgress } from "@secondpass/client";
import type { ReaderLocation, ReaderTocItem } from "../../domain/ReaderDomain.Types";
import {
  READING_PROGRESS_AUTOSAVE_DELAY_MS,
  ReadingProgressAutosaveController,
  type ReadingProgressAutosaveState,
} from "./ReadingProgressAutosave.Controller";
import { buildMarginaliaProgressInput } from "../ReadingSessionMarginalia.Actions";
import { buildSavedReaderLocationLabel } from "../../display/ReaderLocation.Presenter";

const READING_PROGRESS_EXIT_FLUSH_TIMEOUT_MS = 3000;

export function buildReadingProgressSaveInput(input: {
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
  bookTitle?: string | null;
}): {
  cfi: string;
  locationLabel: string;
} | null {
  if (!input.location) return null;
  const cfi = typeof input.location.cfi === "string" ? input.location.cfi.trim() : "";
  if (!cfi) return null;
  return { cfi, locationLabel: buildSavedReaderLocationLabel(input) };
}

export function useReadingProgressAutosave(input: {
  enabled?: boolean;
  autosaveDelayMs?: number;
  spl?: SecondPassClient | null;
  sessionId: string | null;
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
  bookTitle?: string | null;
  savedProgress?: MarginaliaProgress | null;
}) {
  const [autosave, setAutosave] = useState<ReadingProgressAutosaveState>({ status: "idle" });
  const [writesStoppedForClose, setWritesStoppedForClose] = useState(false);
  const controllerRef = useRef<ReadingProgressAutosaveController | null>(null);
  const lifecycleGenerationRef = useRef(0);
  if (!controllerRef.current) controllerRef.current = new ReadingProgressAutosaveController(setAutosave);
  const controller = controllerRef.current;

  const progress = useMemo(() => buildReadingProgressSaveInput({
    location: input.location,
    toc: input.toc,
    bookTitle: input.bookTitle,
  }), [input.bookTitle, input.location, input.toc]);
  const saveProgress = useCallback(
    async (sessionId: string, payload: { cfi: string; locationLabel: string }) => {
      if (!input.spl) throw new Error("Reading progress client is unavailable.");
      const response = await input.spl.marginalia.sessions.replaceProgress(
        sessionId,
        buildMarginaliaProgressInput(payload.cfi, payload.locationLabel),
      );
      return response.progress;
    },
    [input.spl],
  );

  useEffect(() => {
    setWritesStoppedForClose(false);
  }, [input.sessionId]);

  const prepareProgressForClose = useCallback(async () => {
    await controller.flushAndPause();
    setWritesStoppedForClose(true);
  }, [controller]);

  const resumeProgressAfterCloseFailure = useCallback(() => {
    controller.resume();
    setWritesStoppedForClose(false);
  }, [controller]);

  useEffect(() => {
    controller.update({
      enabled: input.enabled !== false && !writesStoppedForClose,
      autosaveDelayMs: input.autosaveDelayMs ?? READING_PROGRESS_AUTOSAVE_DELAY_MS,
      sessionId: input.sessionId,
      progress,
      saveProgress: input.spl ? saveProgress : null,
    });
    if (input.sessionId && input.savedProgress) {
      controller.seedSavedProgress(input.sessionId, input.savedProgress);
    }
  }, [controller, input.autosaveDelayMs, input.enabled, input.savedProgress, input.sessionId, input.spl, progress, saveProgress, writesStoppedForClose]);

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    const lifecycleGeneration = lifecycleGenerationRef.current;
    return () => {
      queueMicrotask(() => {
        if (lifecycleGenerationRef.current !== lifecycleGeneration) return;
        void settleExitFlush(controller).finally(() => {
          if (lifecycleGenerationRef.current === lifecycleGeneration) controller.pause();
        });
      });
    };
  }, [controller]);

  return { autosave, prepareProgressForClose, resumeProgressAfterCloseFailure };
}

async function settleExitFlush(controller: ReadingProgressAutosaveController): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(resolve, READING_PROGRESS_EXIT_FLUSH_TIMEOUT_MS);
  });
  try {
    await Promise.race([controller.flushNow({ silent: true }), timeout]);
  } catch {
    // Exit persistence is best-effort and must not reject into React cleanup.
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
