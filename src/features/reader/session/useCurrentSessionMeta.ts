import { useCallback, useEffect, useState } from "react";
import type { MarginaliaProgressInput, SecondPassClient } from "@secondpass/client";

export type CurrentSessionMeta = {
  name: string | null;
  notes: string | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

export function useCurrentSessionMeta(args: {
  spl?: SecondPassClient | null;
  sessionId: string | null;
  finalProgress?: MarginaliaProgressInput;
}) {
  const [currentSessionMeta, setCurrentSessionMeta] = useState<CurrentSessionMeta>({
    name: null,
    notes: null,
    status: "idle",
    error: null,
  });

  useEffect(() => {
    if (!args.spl) return;
    if (!args.sessionId) return;
    setCurrentSessionMeta((prev) => ({ ...prev, status: "loading", error: null }));
    let cancelled = false;
    void (async () => {
      try {
        const response = await args.spl!.marginalia.sessions.get(args.sessionId!);
        const s = response.session;
        if (cancelled) return;
        const name = typeof (s as any).name === "string" ? (s as any).name : null;
        const notes = typeof (s as any).notes === "string" ? (s as any).notes : null;
        setCurrentSessionMeta({ name, notes, status: "ready", error: null });
      } catch (e) {
        if (cancelled) return;
        setCurrentSessionMeta((prev) => ({
          ...prev,
          status: "error",
          error: e instanceof Error ? e.message : "Failed to load session details.",
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [args.spl, args.sessionId]);

  const updateCurrentSessionMeta = useCallback(
    async (update: { name: string; notes: string }) => {
      if (!args.spl) throw new Error("Not connected.");
      if (!args.sessionId) throw new Error("Missing session id.");
      const name = update.name.trim();
      const notes = update.notes.trim();
      const response = await args.spl.marginalia.sessions.update(args.sessionId, {
        name: name ? name : "",
        notes: notes ? notes : "",
      });
      const nextName = response.session.name;
      const nextNotes = response.session.notes;
      setCurrentSessionMeta({ name: nextName || null, notes: nextNotes || null, status: "ready", error: null });
    },
    [args.spl, args.sessionId],
  );

  const closeCurrentSession = useCallback(
    async (input: { name: string; notes: string }) => {
      if (!args.spl) throw new Error("Not connected.");
      if (!args.sessionId) throw new Error("Missing session id.");

      const savedName = currentSessionMeta.name?.trim() ?? "";
      const savedNotes = currentSessionMeta.notes ?? "";
      const payload: { name?: string; notes?: string } = {};
      if (input.name !== savedName) payload.name = input.name;
      if (input.notes !== savedNotes) payload.notes = input.notes;
      if (Object.keys(payload).length > 0) {
        await args.spl.marginalia.sessions.update(args.sessionId, payload);
      }
      await args.spl.marginalia.sessions.close(
        args.sessionId,
        args.finalProgress ? { progress: args.finalProgress } : undefined,
      );
      setCurrentSessionMeta((prev) => ({ ...prev, name: input.name || null, notes: input.notes || null }));
    },
    [args.finalProgress, args.spl, args.sessionId, currentSessionMeta.name, currentSessionMeta.notes],
  );

  return {
    currentSessionMeta,
    updateCurrentSessionMeta,
    closeCurrentSession,
  };
}
