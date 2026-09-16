import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";

export type CurrentAnnotationEditingState = {
  clientId: string;
  annotationId: string;
  draftNote: string;
  draftColor: string;
  status: "idle" | "saving" | "error";
  error: string | null;
};

export function useCurrentAnnotationEditingController({
  currentHighlights,
  onUpdateHighlight,
}: {
  currentHighlights: readonly { clientId: string; annotationId: string }[];
  onUpdateHighlight: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
}) {
  const [state, setState] = useState<CurrentAnnotationEditingState | null>(null);
  const savingClientIdRef = useRef<string | null>(null);

  useEffect(() => {
    setState((current) => {
      if (!current) return current;
      const canonical = currentHighlights.find((highlight) => highlight.clientId === current.clientId);
      if (!canonical) return null;
      return canonical.annotationId === current.annotationId
        ? current
        : { ...current, annotationId: canonical.annotationId };
    });
  }, [currentHighlights]);

  const begin = useCallback((annotation: {
    clientId: string;
    annotationId: string;
    note?: string;
    color?: string;
  }) => {
    setState({
      clientId: annotation.clientId,
      annotationId: annotation.annotationId,
      draftNote: annotation.note ?? "",
      draftColor: annotation.color ?? "yellow",
      status: "idle",
      error: null,
    });
  }, []);

  const cancel = useCallback(() => setState(null), []);

  const changeNote = useCallback((draftNote: string) => {
    setState((current) => current ? { ...current, draftNote } : current);
  }, []);

  const changeColor = useCallback((draftColor: string) => {
    setState((current) => current ? { ...current, draftColor } : current);
  }, []);

  const save = useCallback(async () => {
    const current = state;
    if (!current || current.status === "saving" || savingClientIdRef.current === current.clientId) return;
    savingClientIdRef.current = current.clientId;
    setState((candidate) => candidate?.clientId === current.clientId
      ? { ...candidate, status: "saving", error: null }
      : candidate);
    try {
      await onUpdateHighlight(current.annotationId, {
        note: current.draftNote,
        color: current.draftColor,
      });
      setState((candidate) => candidate?.clientId === current.clientId ? null : candidate);
    } catch (error) {
      debugWarn("reader", "highlight update did not complete", {
        annotationId: current.annotationId,
        error,
      });
      setState((candidate) => candidate?.clientId === current.clientId
        ? { ...candidate, status: "error", error: "Couldn't update the highlight. Try again." }
        : candidate);
    } finally {
      if (savingClientIdRef.current === current.clientId) savingClientIdRef.current = null;
    }
  }, [onUpdateHighlight, state]);

  return useMemo(() => ({
    state,
    begin,
    cancel,
    changeNote,
    changeColor,
    save,
  }), [begin, cancel, changeColor, changeNote, save, state]);
}
