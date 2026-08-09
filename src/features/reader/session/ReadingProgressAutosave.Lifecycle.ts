import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ReaderLocation } from "../domain/types";
import {
  ReadingProgressAutosaveController,
  type ReadingProgressAutosaveState,
} from "./ReadingProgressAutosave.Controller";
import { buildMarginaliaProgressInput } from "./marginaliaMutations";
import { buildReaderLocationLabel } from "./readerSessionLabels";

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
}) {
  const [autosave, setAutosave] = useState<ReadingProgressAutosaveState>({ status: "idle" });
  const controllerRef = useRef<ReadingProgressAutosaveController | null>(null);
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
      autosaveDelayMs: input.autosaveDelayMs ?? 5000,
      sessionId: input.sessionId,
      progress,
      saveProgress: input.spl ? saveProgress : null,
    });
  }, [controller, input.autosaveDelayMs, input.enabled, input.sessionId, input.spl, progress, saveProgress]);

  useEffect(() => () => controller.pause(), [controller]);

  return { autosave };
}
