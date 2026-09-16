import { useCallback, useEffect, useMemo, useRef } from "react";
import type { EpubTsBookEngine } from "../engine/EpubTsBook.Engine";
import type { ReadingShellCommand, ReadingShellCommandValue, ReadingShellEvent } from "./ReaderShell.Types";
import {
  isExplicitProgressNavigationCommand,
  type ReaderBootstrapProgressGuard,
} from "./ReaderBootstrapProgressGuard.State";
import type { ReaderOperationFailureKind } from "./ReaderOperationError.Policy";
import { isReaderFullyReady, type ReaderReadinessState } from "./ReaderReadiness.State";
import type { ReaderRuntimeController } from "./ReaderRuntime.Controller";
import type { StagedSelectionLifecycle } from "./StagedSelection.Lifecycle";

type MutableRef<T> = { current: T };

type ReportReaderOperationError = (
  error: unknown,
  fallback: string,
  generation: number,
  kind: ReaderOperationFailureKind,
) => void;

export type ReaderCommandRoutingLifecycle = {
  clearDeferredCommand: () => void;
  flushDeferredCommand: (generation: number) => Promise<void>;
  runImmediateCommand: (command: ReadingShellCommandValue, errorFallback: string) => Promise<void>;
};

export function useReaderCommandRoutingLifecycle(input: {
  command?: ReadingShellCommand;
  readiness: ReaderReadinessState;
  engineRef: MutableRef<EpubTsBookEngine | null>;
  engineGenerationRef: MutableRef<number>;
  onEventRef: MutableRef<((event: ReadingShellEvent) => void) | undefined>;
  reanchorStagedToolbarRef: MutableRef<() => Promise<void>>;
  bootstrapProgressGuard: ReaderBootstrapProgressGuard;
  runtimeController: ReaderRuntimeController;
  stagedSelectionLifecycle: StagedSelectionLifecycle;
  markReadableViewport: (generation: number) => void;
  reportOperationError: ReportReaderOperationError;
}): ReaderCommandRoutingLifecycle {
  const {
    bootstrapProgressGuard,
    command,
    engineGenerationRef,
    engineRef,
    markReadableViewport,
    onEventRef,
    readiness,
    reanchorStagedToolbarRef,
    reportOperationError,
    runtimeController,
    stagedSelectionLifecycle,
  } = input;
  const lastHandledCommandSeqRef = useRef<number | null>(null);
  const deferredCommandRef = useRef<ReadingShellCommand | null>(null);
  const latestSearchResultCommandRef = useRef<{ seq: number; cfi: string } | null>(null);

  const runRuntimeCommand = useCallback(
    async (nextCommand: ReadingShellCommandValue, commandSeq?: number) => {
      const generation = engineGenerationRef.current;
      if (isExplicitProgressNavigationCommand(nextCommand)) {
        bootstrapProgressGuard.recordExplicitNavigation(generation);
      }
      switch (nextCommand.type) {
        case "display":
          await runtimeController.run({
            kind: "display",
            run: ({ engine }) => stagedSelectionLifecycle.runNavigation(
              "unrelated",
              () => engine.display(nextCommand.target),
            ),
            after: () => reanchorStagedToolbarRef.current(),
          });
          markReadableViewport(generation);
          return;
        case "displaySearchResult": {
          await runtimeController.run({
            kind: "display-search-result",
            run: ({ engine }) => stagedSelectionLifecycle.runNavigation(
              "unrelated",
              () => engine.display({ type: "cfi", cfi: nextCommand.cfi }),
            ),
            after: async (_value, context) => {
              const latestSearch = latestSearchResultCommandRef.current;
              if (commandSeq != null && latestSearch && latestSearch.seq !== commandSeq) {
                await context.engine.display({ type: "cfi", cfi: latestSearch.cfi });
                if (context.isCurrent()) await reanchorStagedToolbarRef.current();
                return;
              }
              // Paint temporary search state only after display settles on the current result.
              if (commandSeq != null && lastHandledCommandSeqRef.current !== commandSeq) return;
              context.engine.setTemporarySearchHighlight(nextCommand.cfi);
              onEventRef.current?.({ type: "searchResultDisplayed", cfi: nextCommand.cfi });
              await reanchorStagedToolbarRef.current();
            },
          });
          markReadableViewport(generation);
          return;
        }
        case "next":
          await runtimeController.run({
            kind: "next",
            run: ({ engine }) => stagedSelectionLifecycle.runNavigation("unrelated", () => engine.next()),
            after: () => reanchorStagedToolbarRef.current(),
          });
          markReadableViewport(generation);
          return;
        case "previous":
          await runtimeController.run({
            kind: "previous",
            run: ({ engine }) => stagedSelectionLifecycle.runNavigation("unrelated", () => engine.previous()),
            after: () => reanchorStagedToolbarRef.current(),
          });
          markReadableViewport(generation);
          return;
        case "resize":
          await runtimeController.reflow({
            type: "resize-to-mount",
            timing: "after-layout",
          });
          return;
      }
    },
    [bootstrapProgressGuard, markReadableViewport, runtimeController, stagedSelectionLifecycle],
  );

  const clearDeferredCommand = useCallback(() => {
    deferredCommandRef.current = null;
  }, []);

  const flushDeferredCommand = useCallback(async (generation: number) => {
    const deferredCommand = deferredCommandRef.current;
    deferredCommandRef.current = null;
    if (!deferredCommand) return;
    try {
      await runRuntimeCommand(deferredCommand.value, deferredCommand.seq);
    } catch (error) {
      reportOperationError(
        error,
        "Command failed.",
        generation,
        getCommandFailureKind(deferredCommand.value),
      );
    }
  }, [reportOperationError, runRuntimeCommand]);

  const runImmediateCommand = useCallback(async (
    nextCommand: ReadingShellCommandValue,
    errorFallback: string,
  ) => {
    const generation = engineGenerationRef.current;
    try {
      if (!engineRef.current) return;
      await runRuntimeCommand(nextCommand);
    } catch (error) {
      reportOperationError(
        error,
        errorFallback,
        generation,
        getCommandFailureKind(nextCommand),
      );
    }
  }, [reportOperationError, runRuntimeCommand]);

  useEffect(() => {
    if (!command) return;
    if (lastHandledCommandSeqRef.current === command.seq) return;
    lastHandledCommandSeqRef.current = command.seq;

    void (async () => {
      const generation = engineGenerationRef.current;
      try {
        if (command.value.type === "displaySearchResult") {
          latestSearchResultCommandRef.current = { seq: command.seq, cfi: command.value.cfi };
        }
        if (!engineRef.current || !isReaderFullyReady(readiness)) {
          deferredCommandRef.current = command;
          return;
        }
        await runRuntimeCommand(command.value, command.seq);
      } catch (error) {
        reportOperationError(
          error,
          "Command failed.",
          generation,
          getCommandFailureKind(command.value),
        );
      }
    })();
  }, [command, readiness, reportOperationError, runRuntimeCommand]);

  return useMemo(() => ({
    clearDeferredCommand,
    flushDeferredCommand,
    runImmediateCommand,
  }), [clearDeferredCommand, flushDeferredCommand, runImmediateCommand]);
}

function getCommandFailureKind(command: ReadingShellCommandValue): ReaderOperationFailureKind {
  switch (command.type) {
    case "display":
      return "display";
    case "displaySearchResult":
      return "search-result";
    case "next":
    case "previous":
      return "navigation";
    case "resize":
      return "reflow";
  }
}
