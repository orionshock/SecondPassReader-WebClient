import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MarginaliaAnnotation, MarginaliaHighlightColor, SecondPassClient } from "@secondpass/client";
import type { ReaderLocation, ReaderSelection } from "../domain/types";
import { toReaderBookmark, type ReaderBookmark } from "../annotations/bookmarkUtils";
import { getAnnotationColor } from "../display/ReaderAnnotation.Presenter";
import { buildBookmarkUpsert, buildCurrentSessionHighlightCommit, buildHighlightUpdate } from "./marginaliaMutations";
import {
  CurrentSessionAnnotationController,
  CurrentSessionAnnotationStaleGenerationError,
} from "./CurrentSessionAnnotation.Controller";

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
  identity: string;
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
  const annotationsRawRef = useRef(args.annotationsRaw);
  annotationsRawRef.current = args.annotationsRaw;
  const controllerRef = useRef<CurrentSessionAnnotationController | null>(null);
  if (!controllerRef.current) controllerRef.current = new CurrentSessionAnnotationController();
  const controller = controllerRef.current;

  useEffect(() => {
    controller.activate(args.identity, {
      setAnnotations: (annotations) => {
        annotationsRawRef.current = annotations;
        args.setAnnotationsRaw(annotations);
      },
      setBusy: setAnnotationBusy,
      setError: args.setAnnotationError,
    });
    return () => controller.detach(args.identity);
  }, [args.identity, args.setAnnotationError, args.setAnnotationsRaw, controller]);

  const removeById = useCallback(
    async (annotationId: string) => {
      if (!args.spl) return;
      if (args.canMutate === false) return;
      if (!annotationId) return;
      try {
        const annotation = args.annotationsRaw.find((item) => item.id === annotationId);
        if (!annotation) return;
        await controller.mutate({
          run: async () => {
            const response = await args.spl!.marginalia.sessions.batchAnnotations(args.sessionId!, [
              { action: "delete", clientId: annotation.clientId },
            ]);
            return { value: undefined, annotations: response.annotations };
          },
          getErrorMessage: (error) => error instanceof Error ? error.message : "Failed to remove annotation.",
        });
      } catch {
        // Delete already reports active-session failures through the controller.
      }
    },
    [args.annotationsRaw, args.canMutate, args.sessionId, args.spl, controller],
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

      await controller.mutate({
        run: async () => {
          const response = await args.spl!.marginalia.sessions.batchAnnotations(args.sessionId!, [
            buildHighlightUpdate(raw, { color: nextColor as MarginaliaHighlightColor, note: nextNote }),
          ]);
          return { value: undefined, annotations: response.annotations };
        },
        getErrorMessage: (error) => error instanceof Error ? error.message : "Failed to update highlight.",
      });
    },
    [args.annotationsRaw, args.canMutate, args.sessionId, args.spl, controller],
  );

  const toggleBookmarkAtCurrentLocation = useCallback(async (): Promise<ReaderBookmarkMutationResult> => {
    if (args.canMutate === false) return { ok: false, reason: "not-allowed" };
    if (!args.spl || !args.sessionId || !args.location?.cfi?.trim()) return { ok: false, reason: "missing-state" };

    try {
      return await controller.mutate({
        run: async () => {
          const execution = await executeReaderBookmarkMutation(args);
          const result = execution.result;
          const errorMessage = !result.ok && result.reason === "mutation-failed"
            ? result.error instanceof Error
              ? result.error.message
              : args.currentBookmark
                ? "Failed to remove bookmark."
                : "Failed to create bookmark."
            : undefined;
          return {
            value: result,
            annotations: result.ok ? execution.annotations : undefined,
            errorMessage,
          };
        },
        getErrorMessage: (error) => error instanceof Error ? error.message : "Bookmark mutation failed.",
      });
    } catch (error) {
      if (error instanceof CurrentSessionAnnotationStaleGenerationError) {
        return { ok: false, reason: "missing-state" };
      }
      return { ok: false, reason: "mutation-failed", error };
    }
  }, [
    args.annotationsRaw,
    args.canMutate,
    args.currentBookmark,
    args.location,
    args.locationLabel,
    args.sessionId,
    args.spl,
    controller,
  ]);

  const createHighlight = useCallback(
    async (input: { selection: ReaderSelection; color: string; note?: string }) => {
      if (!args.spl) throw new Error("Not connected.");
      if (args.canMutate === false) throw new Error("This session cannot be modified.");
      if (!args.sessionId) throw new Error("Missing session.");
      const sel = input.selection;
      if (!sel?.cfiRange || !sel.text) throw new Error("Missing selection.");

      await controller.mutate({
        run: async () => {
          const response = await args.spl!.marginalia.sessions.batchAnnotations(args.sessionId!, [
            buildCurrentSessionHighlightCommit({
              currentAnnotations: annotationsRawRef.current,
              createClientId: () => crypto.randomUUID(),
              cfi: sel.cfiRange,
              locationLabel: args.locationLabel,
              text: sel.text,
              color: input.color as MarginaliaHighlightColor,
              note: input.note,
              prefix: sel.quotePrefix,
              suffix: sel.quoteSuffix,
            }).operation,
          ]);
          return { value: undefined, annotations: response.annotations };
        },
        getErrorMessage: (error) => error instanceof Error ? error.message : "Failed to create highlight.",
      });
    },
    [args.canMutate, args.locationLabel, args.sessionId, args.spl, controller],
  );

  return {
    annotationBusy,
    removeById,
    updateHighlight,
    toggleBookmarkAtCurrentLocation,
    createHighlight,
  };
}
