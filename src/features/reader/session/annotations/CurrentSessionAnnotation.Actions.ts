import { commitServerCurrentSessionAnnotation } from "./ServerCurrentSessionAnnotation.Adapter";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { MarginaliaAnnotation, SecondPassClient } from "@secondpass/client";
import type { ReaderLocation } from "../../domain/ReaderDomain.Types";
import type { ReaderBookmark } from "../../annotations/ReaderBookmark.Mapper";
import { CurrentSessionAnnotationController } from "./CurrentSessionAnnotation.Controller";
import { useCurrentSessionBookmarkActions } from "./CurrentSessionBookmark.Actions";
import { useCurrentSessionHighlightActions } from "./CurrentSessionHighlight.Actions";
import { debugWarn } from "../../../../lib/debug/DebugLogger.Diagnostics";

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
    if (args.canMutate === false) {
      // Detach immediately when authority changes so queued server mutations cannot finish into local-first state.
      controller.detach(args.identity);
      setAnnotationBusy(false);
      return;
    }
    controller.activate(args.identity, {
      setAnnotations: (annotations) => {
        annotationsRawRef.current = annotations;
        args.setAnnotationsRaw(annotations);
      },
      setBusy: setAnnotationBusy,
      setError: args.setAnnotationError,
    });
    return () => controller.detach(args.identity);
  }, [args.canMutate, args.identity, args.setAnnotationError, args.setAnnotationsRaw, controller]);

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
            const response = await commitServerCurrentSessionAnnotation(args.spl!, args.sessionId,
              { action: "delete", clientId: annotation.clientId },
            );
            return { value: undefined, annotations: response.annotations };
          },
          getErrorMessage: (error) => {
            debugWarn("reader", "annotation removal did not complete", { annotationId, error });
            return "Couldn't remove the annotation. Try again.";
          },
        });
      } catch {
        // Delete already reports active-session failures through the controller.
      }
    },
    [args.annotationsRaw, args.canMutate, args.sessionId, args.spl, controller],
  );

  const { toggleBookmarkAtCurrentLocation } = useCurrentSessionBookmarkActions({
    controller,
    spl: args.spl,
    sessionId: args.sessionId,
    location: args.location,
    locationLabel: args.locationLabel,
    currentBookmark: args.currentBookmark,
    annotationsRaw: args.annotationsRaw,
    canMutate: args.canMutate,
  });
  const { updateHighlight, createHighlight } = useCurrentSessionHighlightActions({
    controller,
    spl: args.spl,
    sessionId: args.sessionId,
    locationLabel: args.locationLabel,
    annotationsRaw: args.annotationsRaw,
    annotationsRawRef,
    canMutate: args.canMutate,
  });

  return {
    annotationBusy,
    removeById,
    updateHighlight,
    toggleBookmarkAtCurrentLocation,
    createHighlight,
  };
}
