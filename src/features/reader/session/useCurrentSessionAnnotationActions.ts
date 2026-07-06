import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ReadingAnnotation, SecondPassClient } from "@secondpass/client";
import type { ReaderLocation, ReaderSelection } from "../domain/types";
import { toReaderBookmark, type ReaderBookmark } from "../annotations/bookmarkUtils";
import { getAnnotationColor } from "../annotations/annotationUtils";

export function useCurrentSessionAnnotationActions(args: {
  spl?: SecondPassClient | null;
  sessionId: string | null;
  location: ReaderLocation | null;
  currentBookmark: ReaderBookmark | null;
  annotationsRaw: ReadingAnnotation[];
  setAnnotationsRaw: Dispatch<SetStateAction<ReadingAnnotation[]>>;
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
        await args.spl.reading.annotations.remove(annotationId);
        args.setAnnotationsRaw((prev) => prev.filter((a) => a.id !== annotationId));
      } catch (e) {
        args.setAnnotationError(e instanceof Error ? e.message : "Failed to remove annotation.");
      } finally {
        setAnnotationBusy(false);
      }
    },
    [args.canMutate, args.spl, args.setAnnotationError, args.setAnnotationsRaw],
  );

  const updateHighlight = useCallback(
    async (annotationId: string, update: { note: string; color: string }) => {
      if (!args.spl) throw new Error("Not connected.");
      if (args.canMutate === false) throw new Error("This session cannot be modified.");
      if (!annotationId) return;

      const raw = args.annotationsRaw.find((a) => a.id === annotationId) ?? null;
      if (!raw) throw new Error("Annotation not found.");

      const nextColor = update.color.trim() || (getAnnotationColor(raw) ?? "").trim() || "yellow";
      const nextNote = update.note.trim();

      setAnnotationBusy(true);
      args.setAnnotationError(null);
      try {
        const updated = await args.spl.reading.annotations.updateNote(annotationId, {
          color: nextColor,
          note: nextNote ? nextNote : null,
        });
        args.setAnnotationsRaw((prev) => [...prev.filter((a) => a.id !== annotationId), updated as unknown as ReadingAnnotation]);
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
      const created = await args.spl.reading.annotations.createBookmark({
        sessionId: args.sessionId,
        cfi,
      });
      const b = toReaderBookmark(created as unknown as ReadingAnnotation);
      if (b) {
        args.setAnnotationsRaw((prev) => [...prev.filter((x) => x.id !== b.id), created as unknown as ReadingAnnotation]);
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
        const created = await args.spl.reading.annotations.createHighlight({
          sessionId: args.sessionId,
          cfiRange: sel.cfiRange,
          text: sel.text,
          color: input.color,
          note: input.note,
          quotePrefix: sel.quotePrefix,
          quoteSuffix: sel.quoteSuffix,
        });
        args.setAnnotationsRaw((prev) => [...prev.filter((x) => x.id !== created.id), created as unknown as ReadingAnnotation]);
      } catch (e) {
        args.setAnnotationError(e instanceof Error ? e.message : "Failed to create highlight.");
        throw e;
      } finally {
        setAnnotationBusy(false);
      }
    },
    [args.canMutate, args.sessionId, args.spl, args.setAnnotationError, args.setAnnotationsRaw],
  );

  return {
    annotationBusy,
    removeById,
    updateHighlight,
    toggleBookmarkAtCurrentLocation,
    createHighlight,
  };
}
