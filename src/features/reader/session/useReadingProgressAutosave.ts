import { ApiError } from "@secondpass/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarginaliaProgress, SecondPassClient } from "@secondpass/client";
import type { ReaderLocation } from "../domain/types";
import { buildMarginaliaProgressInput } from "./marginaliaMutations";

export type ReadingProgressAutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export type ReadingProgressAutosaveState = {
  status: ReadingProgressAutosaveStatus;
  lastSavedAt?: string;
  lastSavedCfi?: string;
  /**
   * Epoch ms when the next debounced save is scheduled to fire.
   * Present only while `status === "pending"` (or briefly while transitioning).
   */
  nextSaveAt?: number;
  error?: string;
  dirty?: boolean;
  progress?: MarginaliaProgress;
};

export function useReadingProgressAutosave(input: {
  enabled?: boolean;
  autosaveDelayMs?: number;
  spl?: SecondPassClient | null;
  sessionId: string | null;
  location: ReaderLocation | null;
  locationLabel?: string;
}) {
  const enabled = input.enabled !== false;
  const autosaveDelayMs = input.autosaveDelayMs ?? 5000;

  const [state, setState] = useState<ReadingProgressAutosaveState>({ status: "idle" });

  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);
  const dirtyRef = useRef(false);
  const lastSavedCfiRef = useRef<string | null>(null);
  const latestCfiRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const progressInput = useMemo(() => {
    if (!input.location) return null;
    const cfi = typeof input.location.cfi === "string" ? input.location.cfi.trim() : "";
    if (!cfi) return null;
    return {
      cfi,
      locationLabel: (input.locationLabel ?? "").slice(0, 255),
    };
  }, [input.location, input.locationLabel]);

  useEffect(() => {
    sessionIdRef.current = input.sessionId;
    const cfi = progressInput?.cfi ?? null;
    latestCfiRef.current = cfi;
  }, [input.sessionId, progressInput]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setState((prev) => ({ ...prev, nextSaveAt: undefined }));
  }, []);

  const resetForSessionSwap = useCallback(
    (nextSessionId: string | null) => {
      generationRef.current += 1;
      clearTimer();
      sessionIdRef.current = nextSessionId;
      inFlightRef.current = false;
      dirtyRef.current = false;
      lastSavedCfiRef.current = null;
      latestCfiRef.current = null;
      setState({ status: "idle" });
    },
    [clearTimer],
  );

  // Reset autosave state when session changes.
  useEffect(() => {
    if (sessionIdRef.current === input.sessionId) return;
    resetForSessionSwap(input.sessionId);
  }, [input.sessionId, resetForSessionSwap]);

  const saveNow = useCallback(async () => {
    const sid = sessionIdRef.current;
    const cfi = latestCfiRef.current;
    if (!enabled) return;
    if (!input.spl || !sid || !progressInput || !cfi) return;

    if (inFlightRef.current) {
      dirtyRef.current = true;
      setState((prev) => ({ ...prev, dirty: true, status: prev.status === "saving" ? "saving" : "pending" }));
      return;
    }

    inFlightRef.current = true;
    dirtyRef.current = false;
    setState((prev) => ({ ...prev, status: "saving", error: undefined, dirty: false, nextSaveAt: undefined }));

    try {
      const response = await input.spl.marginalia.sessions.replaceProgress(
        sid,
        buildMarginaliaProgressInput(progressInput.cfi, progressInput.locationLabel),
      );
      const progress = response.progress;

      const savedAt = new Date().toISOString();
      lastSavedCfiRef.current = cfi;
      setState((prev) => ({
        ...prev,
        status: "saved",
        lastSavedAt: savedAt,
        lastSavedCfi: cfi,
        error: undefined,
        dirty: false,
        nextSaveAt: undefined,
        progress,
      }));
    } catch (e) {
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "Could not save progress. Your device token may be revoked or not allowed to access reading data."
          : e instanceof ApiError && e.status === 404
            ? "Could not save progress. The reading session was not found or is no longer accessible."
            : e instanceof Error
              ? e.message
              : "Failed to save progress.";
      setState((prev) => ({ ...prev, status: "error", error: message, nextSaveAt: undefined }));
    } finally {
      inFlightRef.current = false;

      // If location changed while saving, immediately save the latest known location (no extra debounce).
      const dirty = dirtyRef.current;
      dirtyRef.current = false;
      const latestCfi = latestCfiRef.current;
      const lastSaved = lastSavedCfiRef.current;
      if (dirty && latestCfi && latestCfi !== lastSaved) {
        void saveNow();
      }
    }
  }, [enabled, input.spl, progressInput]);

  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }

    const sid = input.sessionId;
    if (!sid) return;
    if (!progressInput) return;

    const cfi = progressInput.cfi;

    // Suppress if we already successfully saved this CFI.
    if (state.lastSavedCfi && state.lastSavedCfi === cfi) return;

    // If a save is in-flight, mark dirty and wait for completion.
    if (inFlightRef.current || state.status === "saving") {
      dirtyRef.current = true;
      setState((prev) => ({ ...prev, dirty: true, status: prev.status === "saving" ? "saving" : "pending" }));
      return;
    }

    clearTimer();
    generationRef.current += 1;
    const gen = generationRef.current;

    setState((prev) => ({ ...prev, status: "pending", error: undefined }));
    const dueAt = Date.now() + autosaveDelayMs;
    setState((prev) => ({ ...prev, nextSaveAt: dueAt }));
    timerRef.current = window.setTimeout(() => {
      if (gen !== generationRef.current) return;
      void saveNow();
    }, autosaveDelayMs);

    return () => clearTimer();
  }, [autosaveDelayMs, clearTimer, enabled, input.sessionId, progressInput, saveNow, state.lastSavedCfi, state.status]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    autosave: state,
    resetForSessionSwap,
  };
}
