import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { ReadingProgressUpdatePayload } from "../../schemas/readingSession";
import type { ProgressAutosaveState, ProgressSaveState } from "./ProgressPanel";

export function useProgressAutosave(input: {
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
  sessionId: string | null;
  profileVersion: string;
  openedBookKey: string | null;
  initialCfi: string | null;
  currentCfi: string | null;
  currentHref?: string;
  currentProgression?: number | null;
  autosaveDelayMs: number;
  debug?: boolean;
}) {
  const {
    apiBaseUrl,
    accessToken,
    tokenType,
    sessionId,
    profileVersion,
    openedBookKey,
    initialCfi,
    currentCfi,
    currentHref,
    currentProgression,
    autosaveDelayMs,
    debug = false,
  } = input;

  const [saveState, setSaveState] = useState<ProgressSaveState>({ phase: "idle" });
  const [autosave, setAutosave] = useState<ProgressAutosaveState>({ enabled: true, status: "idle" });

  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveGenerationRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const progressPayloadRef = useRef<ReadingProgressUpdatePayload | null>(null);
  const currentCfiRef = useRef<string | null>(null);
  const debugLastKeyRef = useRef<string | null>(null);
  const [autosaveKickSessionId, setAutosaveKickSessionId] = useState<string | null>(null);

  const progressPayload: ReadingProgressUpdatePayload | null = useMemo(() => {
    if (!currentCfi) return null;
    const payload: ReadingProgressUpdatePayload = {
      profile_version: profileVersion,
      current_location: { format: "epub", cfi: currentCfi },
    };
    if (currentHref) payload.current_location = { ...(payload.current_location ?? { format: "epub" }), href: currentHref };
    if (currentProgression != null) payload.progression = currentProgression;
    return payload;
  }, [currentCfi, currentHref, currentProgression, profileVersion]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    progressPayloadRef.current = progressPayload;
    currentCfiRef.current = currentCfi ?? null;
    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[progress] refs updated", {
        sessionId,
        hasPayload: Boolean(progressPayload),
        cfi: currentCfi ? `${currentCfi.slice(0, 48)}...` : null,
      });
    }
  }, [currentCfi, debug, progressPayload, sessionId]);

  const saveProgress = useCallback(
    async (mode: "manual" | "autosave") => {
      const sid = sessionIdRef.current;
      const payload = progressPayloadRef.current;
      const cfi = currentCfiRef.current;
      if (!apiBaseUrl || !accessToken || !sid || !payload) return;

      if (mode === "manual") setSaveState({ phase: "saving" });
      if (mode === "autosave") {
        if (debug) {
          // eslint-disable-next-line no-console
          console.log("[progress] autosave: saving", { sessionId: sid, cfi: cfi ? `${cfi.slice(0, 48)}...` : null });
        }
        setAutosave((prev) => ({ ...prev, status: "saving", error: undefined }));
      }

      try {
        const api = new SecondPassApiClient({ serverBaseUrl: apiBaseUrl });
        const progress = await api.updateReadingProgress({
          apiBaseUrl,
          accessToken,
          tokenType: tokenType ?? "Bearer",
          sessionId: sid,
          payload,
          method: "PATCH",
        });

        const savedAt = new Date().toISOString();
        setSaveState({ phase: "success", savedAt, progress });
        setAutosave((prev) => ({
          ...prev,
          status: mode === "autosave" ? "saved" : prev.status === "saving" ? "saved" : prev.status,
          lastAutosavedAt: savedAt,
          lastAutosavedCfi: cfi ?? prev.lastAutosavedCfi,
          error: undefined,
        }));
        if (mode === "autosave" && debug) {
          // eslint-disable-next-line no-console
          console.log("[progress] autosave: saved", { sessionId: sid, savedAt });
        }
      } catch (e) {
        const message =
          e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
            ? "Could not save progress. Your device token may be revoked or not allowed to access reading data."
            : e instanceof ApiError && e.status === 404
              ? "Could not save progress. The reading session was not found or is no longer accessible."
              : e instanceof Error
                ? e.message
                : "Failed to save progress.";

        if (mode === "manual") setSaveState({ phase: "error", message });
        if (mode === "autosave") {
          if (debug) {
            // eslint-disable-next-line no-console
            console.warn("[progress] autosave: error", { sessionId: sid, message });
          }
          setAutosave((prev) => ({ ...prev, status: "error", error: message }));
        }
      }
    },
    [accessToken, apiBaseUrl, debug, tokenType],
  );

  useEffect(() => {
    // Reset on open-book change.
    if (!openedBookKey) return;
    setSaveState({ phase: "idle" });
    setAutosave((prev) => ({ ...prev, status: "idle", error: undefined }));
  }, [openedBookKey]);

  useEffect(() => {
    // Initialize baseline so we don't immediately re-save the same CFI from bootstrap.
    if (!openedBookKey) return;
    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[progress] autosave baseline init", {
        sessionId,
        initialCfi: initialCfi ? `${initialCfi.slice(0, 48)}...` : null,
      });
    }
    setAutosave((prev) => ({
      ...prev,
      lastAutosavedAt: undefined,
      lastAutosavedCfi: initialCfi ?? undefined,
      status: "idle",
      error: undefined,
    }));
  }, [debug, initialCfi, openedBookKey, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
    autosaveGenerationRef.current += 1;
    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[progress] autosave generation bumped", { sessionId, gen: autosaveGenerationRef.current });
    }
  }, [debug, sessionId]);

  useEffect(() => {
    if (!autosaveKickSessionId) return;
    if (sessionId !== autosaveKickSessionId) return;
    if (!currentCfi) return;

    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[progress] autosave kick: first location observed for new session", {
        sessionId,
        cfi: `${currentCfi.slice(0, 48)}...`,
      });
    }

    setAutosave((prev) => ({
      ...prev,
      lastAutosavedAt: undefined,
      lastAutosavedCfi: undefined,
      status: "idle",
      error: undefined,
    }));
    setAutosaveKickSessionId(null);
  }, [autosaveKickSessionId, currentCfi, debug, sessionId]);

  useEffect(() => {
    if (saveState.phase !== "saving") return;
    if (!autosaveTimerRef.current) return;
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }, [saveState.phase]);

  useEffect(() => {
    if (!autosave.enabled) {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
      return;
    }

    const reasons: string[] = [];
    if (!currentCfi) reasons.push("no-current-cfi");
    if (!apiBaseUrl) reasons.push("no-apiBaseUrl");
    if (!accessToken) reasons.push("no-accessToken");
    if (!sessionId) reasons.push("no-sessionId");
    if (!progressPayload) reasons.push("no-progressPayload");
    if (reasons.length > 0) {
      if (debug) {
        const key = `${sessionId ?? "null"}|${reasons.join(",")}`;
        if (debugLastKeyRef.current !== key) {
          debugLastKeyRef.current = key;
          // eslint-disable-next-line no-console
          console.log("[progress] autosave not scheduling", {
            sessionId,
            reasons,
            cfi: currentCfi ? `${currentCfi.slice(0, 48)}...` : null,
          });
        }
      }
      return;
    }

    const cfi = currentCfi;
    if (!cfi) return;
    if (saveState.phase === "saving" || autosave.status === "saving") {
      setAutosave((prev) => ({ ...prev, status: "dirty" }));
      return;
    }

    if (autosave.lastAutosavedCfi && autosave.lastAutosavedCfi === cfi) {
      if (debug) {
        const key = `${sessionId}|same-cfi`;
        if (debugLastKeyRef.current !== key) {
          debugLastKeyRef.current = key;
          // eslint-disable-next-line no-console
          console.log("[progress] autosave suppressed (same cfi)", { sessionId, cfi: `${cfi.slice(0, 48)}...` });
        }
      }
      return;
    }

    setAutosave((prev) => ({ ...prev, status: "waiting", error: undefined }));

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    const gen = autosaveGenerationRef.current;
    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[progress] autosave scheduled", { sessionId, gen, cfi: `${cfi.slice(0, 48)}...`, delayMs: autosaveDelayMs });
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      if (gen !== autosaveGenerationRef.current) return;
      if (debug) {
        // eslint-disable-next-line no-console
        console.log("[progress] autosave timer fired", { sessionId: sessionIdRef.current, gen });
      }
      void saveProgress("autosave");
    }, autosaveDelayMs);

    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [
    accessToken,
    apiBaseUrl,
    autosave.enabled,
    autosave.lastAutosavedCfi,
    autosave.status,
    autosaveDelayMs,
    currentCfi,
    debug,
    progressPayload,
    saveProgress,
    saveState.phase,
    sessionId,
  ]);

  const kickAutosaveForSession = useCallback((sid: string) => setAutosaveKickSessionId(sid), []);

  const resetForSessionSwap = useCallback((sid: string) => {
    setAutosave((prev) => ({
      ...prev,
      status: "idle",
      lastAutosavedAt: undefined,
      lastAutosavedCfi: undefined,
      error: undefined,
    }));
    setAutosaveKickSessionId(sid);
  }, []);

  return { autosave, saveState, progressPayload, setAutosave, setSaveState, kickAutosaveForSession, resetForSessionSwap };
}

