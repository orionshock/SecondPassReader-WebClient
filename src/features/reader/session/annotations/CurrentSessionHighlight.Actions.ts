import { commitServerCurrentSessionAnnotation } from "./ServerCurrentSessionAnnotation.Adapter";
import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { MarginaliaAnnotation, MarginaliaHighlightColor, SecondPassClient } from "@secondpass/client";
import type { ReaderSelection } from "../../domain/ReaderDomain.Types";
import { getAnnotationColor } from "../../annotations/ReaderAnnotationSelectors.Queries";
import { buildCurrentSessionHighlightCommit, buildHighlightUpdate } from "../ReadingSessionMarginalia.Actions";
import type { CurrentSessionAnnotationController } from "./CurrentSessionAnnotation.Controller";
import { debugWarn } from "../../../../lib/debug/DebugLogger.Diagnostics";

export function useCurrentSessionHighlightActions(args: {
  controller: CurrentSessionAnnotationController;
  spl?: SecondPassClient | null;
  sessionId: string | null;
  locationLabel?: string;
  annotationsRaw: MarginaliaAnnotation[];
  annotationsRawRef: MutableRefObject<MarginaliaAnnotation[]>;
  canMutate?: boolean;
}) {
  const updateHighlight = useCallback(
    async (annotationId: string, update: { note: string; color: string }) => {
      if (!args.spl) throw new Error("Not connected.");
      if (args.canMutate === false) throw new Error("This session cannot be modified.");
      if (!annotationId) return;

      const raw = args.annotationsRaw.find((annotation) => annotation.id === annotationId && annotation.kind === "highlight") ?? null;
      if (!raw || raw.kind !== "highlight") throw new Error("Highlight not found.");

      const nextColor = update.color.trim() || (getAnnotationColor(raw) ?? "").trim() || "yellow";
      const nextNote = update.note;

      await args.controller.mutate({
        run: async () => {
          const response = await commitServerCurrentSessionAnnotation(args.spl!, args.sessionId,
            buildHighlightUpdate(raw, { color: nextColor as MarginaliaHighlightColor, note: nextNote }),
          );
          return { value: undefined, annotations: response.annotations };
        },
        getErrorMessage: () => "Couldn't update the highlight. Try again.",
      });
    },
    [args.annotationsRaw, args.canMutate, args.controller, args.sessionId, args.spl],
  );

  const createHighlight = useCallback(
    async (input: { selection: ReaderSelection; color: string; note?: string }) => {
      if (!args.spl) throw new Error("Not connected.");
      if (args.canMutate === false) throw new Error("This session cannot be modified.");
      if (!args.sessionId) throw new Error("Missing session.");
      const selection = input.selection;
      if (!selection?.cfiRange || !selection.text) throw new Error("Missing selection.");

      await args.controller.mutate({
        run: async () => {
          const response = await commitServerCurrentSessionAnnotation(args.spl!, args.sessionId,
            buildCurrentSessionHighlightCommit({
              currentAnnotations: args.annotationsRawRef.current,
              createClientId: () => crypto.randomUUID(),
              cfi: selection.cfiRange,
              locationLabel: args.locationLabel,
              text: selection.text,
              color: input.color as MarginaliaHighlightColor,
              note: input.note,
              prefix: selection.quotePrefix,
              suffix: selection.quoteSuffix,
            }).operation,
          );
          return { value: undefined, annotations: response.annotations };
        },
        getErrorMessage: (error) => {
          debugWarn("reader", "highlight creation did not complete", { error });
          return "Couldn't save the highlight. Try again.";
        },
      });
    },
    [args.annotationsRawRef, args.canMutate, args.controller, args.locationLabel, args.sessionId, args.spl],
  );

  return { updateHighlight, createHighlight };
}
