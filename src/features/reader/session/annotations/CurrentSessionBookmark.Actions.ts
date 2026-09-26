import { commitServerCurrentSessionAnnotation } from "./ServerCurrentSessionAnnotation.Adapter";
import { useCallback } from "react";
import type { MarginaliaAnnotation, SecondPassClient } from "@secondpass/client";
import type { ReaderLocation } from "../../domain/ReaderDomain.Types";
import { toReaderBookmark, type ReaderBookmark } from "../../annotations/ReaderBookmark.Mapper";
import { buildBookmarkUpsert } from "../ReadingSessionMarginalia.Actions";
import {
  CurrentSessionAnnotationController,
  CurrentSessionAnnotationStaleGenerationError,
} from "./CurrentSessionAnnotation.Controller";
import { debugWarn } from "../../../../lib/debug/DebugLogger.Diagnostics";

export type ReaderBookmarkMutationResult =
  | { ok: true; action: "created" | "deleted" }
  | { ok: false; reason: "missing-state" | "not-allowed" | "mutation-failed"; error?: unknown };

export function canMutateReaderBookmark(input: {
  canMutateAnnotations: boolean;
  cfi?: string | null;
}): boolean {
  return Boolean(input.canMutateAnnotations && input.cfi?.trim());
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

      const response = await commitServerCurrentSessionAnnotation(args.spl!, args.sessionId,
        { action: "delete", clientId: annotation.clientId },
      );
      return { result: { ok: true, action: "deleted" }, annotations: response.annotations };
    }

    const response = await commitServerCurrentSessionAnnotation(args.spl!, args.sessionId,
      buildBookmarkUpsert({ clientId: crypto.randomUUID(), cfi, locationLabel: args.locationLabel }),
    );
    const created = response.annotations.find((item) => item.kind === "bookmark" && item.location.location === cfi);
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

export function useCurrentSessionBookmarkActions(args: {
  controller: CurrentSessionAnnotationController;
  spl?: SecondPassClient | null;
  sessionId: string | null;
  location: ReaderLocation | null;
  locationLabel?: string;
  currentBookmark: ReaderBookmark | null;
  annotationsRaw: MarginaliaAnnotation[];
  canMutate?: boolean;
}) {
  const toggleBookmarkAtCurrentLocation = useCallback(async (): Promise<ReaderBookmarkMutationResult> => {
    if (args.canMutate === false) return { ok: false, reason: "not-allowed" };
    if (!args.spl || !args.sessionId || !args.location?.cfi?.trim()) return { ok: false, reason: "missing-state" };

    try {
      return await args.controller.mutate({
        run: async () => {
          const execution = await executeReaderBookmarkMutation(args);
          const result = execution.result;
          const errorMessage = !result.ok && result.reason === "mutation-failed"
            ? args.currentBookmark
              ? "Couldn't remove the bookmark. Try again."
              : "Couldn't save the bookmark. Try again."
            : undefined;
          if (!result.ok && result.reason === "mutation-failed") {
            debugWarn("reader", "bookmark mutation did not complete", {
              action: args.currentBookmark ? "remove" : "save",
              error: result.error,
            });
          }
          return {
            value: result,
            annotations: result.ok ? execution.annotations : undefined,
            errorMessage,
          };
        },
        getErrorMessage: (error) => {
          debugWarn("reader", "bookmark mutation did not complete", {
            action: args.currentBookmark ? "remove" : "save",
            error,
          });
          return args.currentBookmark
            ? "Couldn't remove the bookmark. Try again."
            : "Couldn't save the bookmark. Try again.";
        },
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
    args.controller,
    args.currentBookmark,
    args.location,
    args.locationLabel,
    args.sessionId,
    args.spl,
  ]);

  return { toggleBookmarkAtCurrentLocation };
}
