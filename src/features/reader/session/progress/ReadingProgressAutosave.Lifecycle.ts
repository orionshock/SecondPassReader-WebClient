import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { MarginaliaProgress } from "@secondpass/client";
import type { ReaderLocation } from "../../domain/ReaderDomain.Types";
import {
  READING_PROGRESS_AUTOSAVE_DELAY_MS,
  ReadingProgressAutosaveController,
  type ReadingProgressAutosaveState,
} from "./ReadingProgressAutosave.Controller";
import { buildMarginaliaProgressInput } from "../ReadingSessionMarginalia.Actions";
import { buildReaderLocationLabel } from "../../display/ReaderLocation.Presenter";

const READING_PROGRESS_EXIT_FLUSH_TIMEOUT_MS = 3000;

export function buildReadingProgressSaveInput(location: ReaderLocation | null): {
  cfi: string;
  locationLabel: string;
} | null {
  if (!location) return null;
  const cfi = typeof location.cfi === "string" ? location.cfi.trim() : "";
  if (!cfi) return null;
  return { cfi, locationLabel: buildReaderLocationLabel(location) };
}

export function useReadingProgressAutosave(input: {
  enabled?: boolean;
  autosaveDelayMs?: number;
  spl?: SecondPassClient | null;
  sessionId: string | null;
  location: ReaderLocation | null;
  savedProgress?: MarginaliaProgress | null;
}) {
  const [autosave, setAutosave] = useState<ReadingProgressAutosaveState>({ status: "idle" });
  const controllerRef = useRef<ReadingProgressAutosaveController | null>(null);
  const lifecycleGenerationRef = useRef(0);
  if (!controllerRef.current) controllerRef.current = new ReadingProgressAutosaveController(setAutosave);
  const controller = controllerRef.current;

  const progress = useMemo(() => buildReadingProgressSaveInput(input.location), [input.location]);
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
    controller.update({
      enabled: input.enabled !== false,
      autosaveDelayMs: input.autosaveDelayMs ?? READING_PROGRESS_AUTOSAVE_DELAY_MS,
      sessionId: input.sessionId,
      progress,
      saveProgress: input.spl ? saveProgress : null,
    });
    if (input.sessionId && input.savedProgress) {
      controller.seedSavedProgress(input.sessionId, input.savedProgress);
    }
  }, [controller, input.autosaveDelayMs, input.enabled, input.savedProgress, input.sessionId, input.spl, progress, saveProgress]);

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

  return { autosave };
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
