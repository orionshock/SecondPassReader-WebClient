import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MarginaliaAnnotation, MarginaliaHighlightColor, SecondPassClient } from "@secondpass/client";
import type { ReaderLocation, ReaderSelection } from "../domain/types";
import { toReaderBookmark, type ReaderBookmark } from "../annotations/bookmarkUtils";
import { getAnnotationColor } from "../display/ReaderAnnotation.Presenter";
import { buildBookmarkUpsert, buildHighlightUpdate, buildHighlightUpsert } from "./marginaliaMutations";

export type ReaderBookmarkMutationResult =
  | { ok: true; action: "created" | "deleted" }
  | { ok: false; reason: "missing-state" | "not-allowed" | "mutation-failed"; error?: unknown };

export function canMutateReaderBookmark(input: {
  canMutateSession: boolean;
  sessionId: string | null;
  cfi?: string | null;
}): boolean {
  return Boolean(input.canMutateSession && input.sessionId && input.cfi?.trim());
}

export async function executeReaderBookmarkMutation(args: {
  spl?: SecondPassClient | null;
  sessionId: string | null;
  location: ReaderLocation | null;
  locationLabel?: string;
  currentBookmark: ReaderBookmark | null;
  annotationsRaw: MarginaliaAnnotation[];
  canMutate?: boolean;
}): Promise<{ result: ReaderBookmarkMutationResult; annotations?: MarginaliaAnnotation[] }> {
  if (args.canMutate === false) return { result: { ok: false, reason: "not-allowed" } };

  const cfi = args.location?.cfi?.trim() ?? "";
  if (!args.spl || !args.sessionId || !cfi) return { result: { ok: false, reason: "missing-state" } };

  try {
    if (args.currentBookmark) {
      const annotation = args.annotationsRaw.find((item) => item.id === args.currentBookmark?.id);
      if (!annotation) return { result: { ok: false, reason: "missing-state" } };

      const response = await args.spl.marginalia.sessions.batchAnnotations(args.sessionId, [
        { action: "delete", clientId: annotation.clientId },
      ]);
      return { result: { ok: true, action: "deleted" }, annotations: response.annotations };
    }

    const response = await args.spl.marginalia.sessions.batchAnnotations(args.sessionId, [
      buildBookmarkUpsert({ clientId: crypto.randomUUID(), cfi, locationLabel: args.locationLabel }),
    ]);
    const created = response.annotations.find((item) => item.kind === "bookmark" && item.location.cfi === cfi);
    if (!created || !toReaderBookmark(created)) {
      return {
        result: {
          ok: false,
          reason: "mutation-failed",
          error: new Error("The bookmark mutation completed without returning the created bookmark."),
        },
      };
    }
    return { result: { ok: true, action: "created" }, annotations: response.annotations };
  } catch (error) {
    return { result: { ok: false, reason: "mutation-failed", error } };
  }
}

export function useCurrentSessionAnnotationActions(args: {
  spl?: SecondPassClient | null;
  sessionId: string | null;
  location: ReaderLocation | null;
  locationLabel?: string;
  currentBookmark: ReaderBookmark | null;
  annotationsRaw: MarginaliaAnnotation[];
  setAnnotationsRaw: Dispatch<SetStateAction<MarginaliaAnnotation[]>>;
  setAnnotationError: (value: string | null) => void;
  canMutate?: boolean;
}) {
  const [annotationBusy, setAnnotationBusy] = useState(false);

  const removeById = useCallback(
    async (annotationId: string) => {
      if (!args.spl) return;
      if (args.canMutate === false) return;
      if (!annotationId) return;
      setAnnotationBusy(true);
      args.setAnnotationError(null);
      try {
        const annotation = args.annotationsRaw.find((item) => item.id === annotationId);
        if (!annotation) return;
        const response = await args.spl.marginalia.sessions.batchAnnotations(args.sessionId!, [
          { action: "delete", clientId: annotation.clientId },
        ]);
        args.setAnnotationsRaw(response.annotations);
      } catch (e) {
        args.setAnnotationError(e instanceof Error ? e.message : "Failed to remove annotation.");
      } finally {
        setAnnotationBusy(false);
      }
    },
    [args.annotationsRaw, args.canMutate, args.sessionId, args.spl, args.setAnnotationError, args.setAnnotationsRaw],
  );

  const updateHighlight = useCallback(
    async (annotationId: string, update: { note: string; color: string }) => {
      if (!args.spl) throw new Error("Not connected.");
      if (args.canMutate === false) throw new Error("This session cannot be modified.");
      if (!annotationId) return;

      const raw = args.annotationsRaw.find((a) => a.id === annotationId && a.kind === "highlight") ?? null;
      if (!raw || raw.kind !== "highlight") throw new Error("Highlight not found.");

      const nextColor = update.color.trim() || (getAnnotationColor(raw) ?? "").trim() || "yellow";
      const nextNote = update.note;

      setAnnotationBusy(true);
      args.setAnnotationError(null);
      try {
        const response = await args.spl.marginalia.sessions.batchAnnotations(args.sessionId!, [
          buildHighlightUpdate(raw, { color: nextColor as MarginaliaHighlightColor, note: nextNote }),
        ]);
        args.setAnnotationsRaw(response.annotations);
      } catch (e) {
        args.setAnnotationError(e instanceof Error ? e.message : "Failed to update highlight.");
        throw e;
      } finally {
        setAnnotationBusy(false);
      }
    },
    [args.annotationsRaw, args.canMutate, args.spl, args.setAnnotationError, args.setAnnotationsRaw],
  );

  const toggleBookmarkAtCurrentLocation = useCallback(async (): Promise<ReaderBookmarkMutationResult> => {
    if (args.canMutate === false) return { ok: false, reason: "not-allowed" };
    if (!args.spl || !args.sessionId || !args.location?.cfi?.trim()) return { ok: false, reason: "missing-state" };

    setAnnotationBusy(true);
    args.setAnnotationError(null);
    try {
      const execution = await executeReaderBookmarkMutation(args);
      const result = execution.result;
      if (result.ok) {
        if (execution.annotations) args.setAnnotationsRaw(execution.annotations);
      } else if (result.reason === "mutation-failed") {
        const message = result.error instanceof Error
          ? result.error.message
          : args.currentBookmark
            ? "Failed to remove bookmark."
            : "Failed to create bookmark.";
        args.setAnnotationError(message);
      }
      return result;
    } finally {
      setAnnotationBusy(false);
    }
  }, [
    args.annotationsRaw,
    args.canMutate,
    args.currentBookmark,
    args.location,
    args.locationLabel,
    args.sessionId,
    args.spl,
    args.setAnnotationError,
    args.setAnnotationsRaw,
  ]);

  const createHighlight = useCallback(
    async (input: { selection: ReaderSelection; color: string; note?: string }) => {
      if (!args.spl) throw new Error("Not connected.");
      if (args.canMutate === false) throw new Error("This session cannot be modified.");
      if (!args.sessionId) throw new Error("Missing session.");
      const sel = input.selection;
      if (!sel?.cfiRange || !sel.text) throw new Error("Missing selection.");

      setAnnotationBusy(true);
      args.setAnnotationError(null);
      try {
        const response = await args.spl.marginalia.sessions.batchAnnotations(args.sessionId, [
          buildHighlightUpsert({
            clientId: crypto.randomUUID(),
            cfi: sel.cfiRange,
            locationLabel: args.locationLabel,
            text: sel.text,
            color: input.color as MarginaliaHighlightColor,
            note: input.note,
            prefix: sel.quotePrefix,
            suffix: sel.quoteSuffix,
          }),
        ]);
        args.setAnnotationsRaw(response.annotations);
      } catch (e) {
        args.setAnnotationError(e instanceof Error ? e.message : "Failed to create highlight.");
        throw e;
      } finally {
        setAnnotationBusy(false);
      }
    },
    [args.canMutate, args.locationLabel, args.sessionId, args.spl, args.setAnnotationError, args.setAnnotationsRaw],
  );

  return {
    annotationBusy,
    removeById,
    updateHighlight,
    toggleBookmarkAtCurrentLocation,
    createHighlight,
  };
}
