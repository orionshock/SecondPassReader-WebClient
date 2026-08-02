import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MarginaliaAnnotation, MarginaliaHighlightColor, SecondPassClient } from "@secondpass/client";
import type { ReaderLocation, ReaderSelection } from "../domain/types";
import { toReaderBookmark, type ReaderBookmark } from "../annotations/bookmarkUtils";
import { getAnnotationColor } from "../annotations/annotationUtils";
import { buildBookmarkUpsert, buildHighlightUpdate, buildHighlightUpsert } from "./marginaliaMutations";

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
      const nextNote = update.note.trim();

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

  const toggleBookmarkAtCurrentLocation = useCallback(async () => {
    if (!args.spl) return;
    if (args.canMutate === false) return;
    if (!args.sessionId) return;
    const cfi = args.location?.cfi?.trim() ?? "";
    if (!cfi) return;

    if (args.currentBookmark) {
      await removeById(args.currentBookmark.id);
      return;
    }

    setAnnotationBusy(true);
    args.setAnnotationError(null);
    try {
      const response = await args.spl.marginalia.sessions.batchAnnotations(args.sessionId, [
        buildBookmarkUpsert({ clientId: crypto.randomUUID(), cfi, locationLabel: args.locationLabel }),
      ]);
      const created = response.annotations.find((item) => item.kind === "bookmark" && item.location.cfi === cfi);
      const b = created ? toReaderBookmark(created) : null;
      if (b) {
        args.setAnnotationsRaw(response.annotations);
      }
    } catch (e) {
      args.setAnnotationError(e instanceof Error ? e.message : "Failed to create bookmark.");
    } finally {
      setAnnotationBusy(false);
    }
  }, [
    args.currentBookmark,
    args.canMutate,
    args.location?.cfi,
    args.locationLabel,
    args.sessionId,
    args.spl,
    args.setAnnotationError,
    args.setAnnotationsRaw,
    removeById,
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
