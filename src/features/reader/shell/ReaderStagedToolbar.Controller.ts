import { useCallback, useEffect, useRef } from "react";
import type { ReaderHighlightMark, ReaderSelection } from "../domain/types";
import type {
  StagedSelectionCommitInput,
  StagedSelectionHandle,
  StagedSelectionSource,
} from "../domain/ReaderBridge.Types";
import type { EpubTsBookEngine } from "../engine/EpubTsBookEngine";
import type { SelectionHighlightToolbarProps } from "./ReaderSelectionHighlightToolbar.Toolbar";
import { isReaderFullyReady, type ReaderReadinessState } from "./ReaderReadiness.State";
import { StagedSelectionLifecycle } from "./StagedSelection.Lifecycle";
import { useStagedSelectionToolbar } from "./ReaderStagedSelection.Controller";

type MutableRef<T> = { current: T };

export type ReaderStagedToolbarController = {
  cancelStaged: () => void;
  onEngineSelectionChanged: (selection: ReaderSelection | null) => void;
  reanchorStagedToolbarRef: MutableRef<() => Promise<void>>;
  stagedSelectionLifecycle: StagedSelectionLifecycle;
  toolbarProps: SelectionHighlightToolbarProps | null;
};

export function useReaderStagedToolbarController(input: {
  engineRef: MutableRef<EpubTsBookEngine | null>;
  mountWrapperRef: MutableRef<HTMLDivElement | null>;
  readiness: ReaderReadinessState;
  highlightMarks?: ReaderHighlightMark[];
  onCommitHighlight?: (commit: StagedSelectionCommitInput) => Promise<void>;
  commitBusy?: boolean;
  onStagedSelectionReady?: (handle: StagedSelectionHandle | null) => void;
  onStagedSelectionCommitted?: (source: StagedSelectionSource) => void;
  onStagedSelectionCanceled?: (source: StagedSelectionSource) => void;
  onUnrelatedNavigation?: () => void;
  onSelectionStarted: () => void;
}): ReaderStagedToolbarController {
  const {
    commitBusy,
    engineRef,
    highlightMarks,
    mountWrapperRef,
    onCommitHighlight,
    onSelectionStarted,
    onStagedSelectionCanceled,
    onStagedSelectionCommitted,
    onStagedSelectionReady,
    onUnrelatedNavigation,
    readiness,
  } = input;
  const onUnrelatedNavigationRef = useRef(onUnrelatedNavigation);
  useEffect(() => {
    onUnrelatedNavigationRef.current = onUnrelatedNavigation;
  }, [onUnrelatedNavigation]);

  const staged = useStagedSelectionToolbar({
    engineRef,
    mountWrapperRef,
    highlightMarks,
    onCommitHighlight,
    onStagedSelectionCommitted,
    onStagedSelectionCanceled,
    commitBusy,
  });
  const { onSelectionChanged, cancelStaged } = staged;
  const stagedSelectionLifecycleRef = useRef<StagedSelectionLifecycle | null>(null);
  if (!stagedSelectionLifecycleRef.current) {
    stagedSelectionLifecycleRef.current = new StagedSelectionLifecycle({
      cancelStagedSelection: cancelStaged,
      hasStagedSelection: staged.hasStagedSelection,
      onUnrelatedNavigation: () => onUnrelatedNavigationRef.current?.(),
    });
  }
  const stagedSelectionLifecycle = stagedSelectionLifecycleRef.current;
  const reanchorStagedToolbarRef = useRef(staged.reanchorStagedToolbar);
  reanchorStagedToolbarRef.current = staged.reanchorStagedToolbar;

  const onEngineSelectionChanged = useCallback((selection: ReaderSelection | null) => {
    if (selection) onSelectionStarted();
    onSelectionChanged(selection);
  }, [onSelectionChanged, onSelectionStarted]);

  useEffect(() => {
    if (!isReaderFullyReady(readiness)) {
      onStagedSelectionReady?.(null);
      return;
    }
    onStagedSelectionReady?.({
      stageSelectionFromCfiRange: staged.stageSelectionFromCfiRange,
      runStagingTransaction: (operation) => stagedSelectionLifecycle.runNavigation(
        "import-staging",
        operation,
      ),
      cancelStagedSelection: staged.cancelStaged,
    });
    return () => onStagedSelectionReady?.(null);
  }, [
    onStagedSelectionReady,
    readiness,
    staged.cancelStaged,
    staged.stageSelectionFromCfiRange,
    stagedSelectionLifecycle,
  ]);

  const toolbarProps: SelectionHighlightToolbarProps | null = staged.stagedSelection && staged.toolbarPos
    ? {
        open: true,
        left: staged.toolbarPos.left,
        top: staged.toolbarPos.top,
        placement: staged.toolbarPos.placement,
        color: staged.stagedColor,
        noteOpen: staged.noteOpen,
        noteDraft: staged.noteDraft,
        busy: staged.commitBusy,
        onPickColorAndCommit: staged.commitColor,
        onToggleNote: staged.toggleNote,
        onChangeNoteDraft: staged.setNoteDraft,
        onCancel: staged.cancelStaged,
        onSizeChange: staged.onToolbarSizeChange,
      }
    : null;

  return {
    cancelStaged,
    onEngineSelectionChanged,
    reanchorStagedToolbarRef,
    stagedSelectionLifecycle,
    toolbarProps,
  };
}
