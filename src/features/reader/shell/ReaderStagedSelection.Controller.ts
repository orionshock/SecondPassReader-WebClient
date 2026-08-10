import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EpubTsBookEngine } from "../engine/EpubTsBook.Engine";
import type { ReaderHighlightMark, ReaderSelection } from "../domain/ReaderDomain.Types";
import type {
  ProgrammaticStagedSelectionInput,
  StagedSelectionCommitInput,
  StagedSelectionSource,
  StagedSelectionToolbarPosition,
} from "../domain/ReaderBridge.Types";
import {
  debugStagedSelection,
  previewStagedSelectionCfi,
} from "./ReaderStagedSelection.Diagnostics";
import { useReaderStagedSelectionReanchorController } from "./ReaderStagedSelectionReanchor.Controller";

export type StagedSelectionToolbarPos = StagedSelectionToolbarPosition;

export function useStagedSelectionToolbar(args: {
  engineRef: React.MutableRefObject<EpubTsBookEngine | null>;
  mountWrapperRef: React.RefObject<HTMLDivElement | null>;
  highlightMarks?: ReaderHighlightMark[];
  onCommitHighlight?: (input: StagedSelectionCommitInput) => Promise<void>;
  onStagedSelectionCommitted?: (source: StagedSelectionSource) => void;
  onStagedSelectionCanceled?: (source: StagedSelectionSource) => void;
  commitBusy?: boolean;
}) {
  const [stagedSelection, setStagedSelection] = useState<ReaderSelection | null>(null);
  const stagedSelectionRef = useRef<ReaderSelection | null>(null);
  const [stagedSource, setStagedSource] = useState<StagedSelectionSource>({ kind: "user-selection" });
  const stagedSourceRef = useRef<StagedSelectionSource>({ kind: "user-selection" });
  const [stagedColor, setStagedColor] = useState<string>("yellow");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const highlightMarksRef = useRef<ReaderHighlightMark[]>(args.highlightMarks ?? []);
  const noteDraftRef = useRef<string>("");
  const stagedColorRef = useRef<string>("yellow");
  const onCommitHighlightRef = useRef<typeof args.onCommitHighlight>(args.onCommitHighlight);
  const onCommittedRef = useRef<typeof args.onStagedSelectionCommitted>(args.onStagedSelectionCommitted);
  const onCanceledRef = useRef<typeof args.onStagedSelectionCanceled>(args.onStagedSelectionCanceled);
  useEffect(() => {
    highlightMarksRef.current = args.highlightMarks ?? [];
  }, [args.highlightMarks]);

  useEffect(() => {
    onCommitHighlightRef.current = args.onCommitHighlight;
  }, [args.onCommitHighlight]);

  useEffect(() => {
    onCommittedRef.current = args.onStagedSelectionCommitted;
  }, [args.onStagedSelectionCommitted]);

  useEffect(() => {
    onCanceledRef.current = args.onStagedSelectionCanceled;
  }, [args.onStagedSelectionCanceled]);

  useEffect(() => {
    stagedSelectionRef.current = stagedSelection;
  }, [stagedSelection]);

  useEffect(() => {
    stagedSourceRef.current = stagedSource;
  }, [stagedSource]);

  useEffect(() => {
    noteDraftRef.current = noteDraft;
  }, [noteDraft]);

  useEffect(() => {
    stagedColorRef.current = stagedColor;
  }, [stagedColor]);

  const {
    toolbarPos,
    toolbarPosRef,
    resetStagedToolbar,
    positionStagedToolbar,
    setStagedToolbarFallback,
    reanchorStagedToolbar,
    onToolbarSizeChange,
  } = useReaderStagedSelectionReanchorController({
    engineRef: args.engineRef,
    mountWrapperRef: args.mountWrapperRef,
    stagedSelectionRef,
  });

  const clearStaged = useCallback((options?: { notifyCancel?: boolean }) => {
    const source = stagedSourceRef.current;
    debugStagedSelection("clearing staged selection", {
      hadSelection: Boolean(stagedSelectionRef.current),
      sourceKind: source.kind,
      importRowId: source.kind === "import" ? source.importRowId : undefined,
      cfiPreview: previewStagedSelectionCfi(stagedSelectionRef.current?.cfiRange),
      notifyCancel: Boolean(options?.notifyCancel),
    });
    stagedSelectionRef.current = null;
    stagedSourceRef.current = { kind: "user-selection" };
    noteDraftRef.current = "";
    resetStagedToolbar();
    setStagedSelection(null);
    setStagedSource({ kind: "user-selection" });
    setStagedColor("yellow");
    setNoteOpen(false);
    setNoteDraft("");
    const engine = args.engineRef.current;
    // Remove temporary renderer marks before returning to durable marks only.
    engine?.setTemporarySearchHighlight(null);
    engine?.setHighlightMarks(highlightMarksRef.current);
    engine?.clearSelection();
    if (options?.notifyCancel && source.kind !== "user-selection") {
      onCanceledRef.current?.(source);
    }
  }, [args.engineRef, resetStagedToolbar]);

  const cancelStaged = useCallback(() => {
    clearStaged({ notifyCancel: true });
  }, [clearStaged]);

  const stageSelection = useCallback(
    (selection: ReaderSelection, options?: { source?: StagedSelectionSource; color?: string; note?: string; toolbarPosition?: StagedSelectionToolbarPos | null; deferToolbar?: boolean }) => {
      // Selecting new text discards any previous uncommitted staged highlight.
      const nextColor = options?.color?.trim() || "yellow";
      const nextNote = options?.note?.trim() ?? "";
      const nextSource = options?.source ?? { kind: "user-selection" };
      const previousSource = stagedSourceRef.current;
      debugStagedSelection("staging selection state", {
        sourceKind: nextSource.kind,
        importRowId: nextSource.kind === "import" ? nextSource.importRowId : undefined,
        cfiPreview: previewStagedSelectionCfi(selection.cfiRange),
        textLength: selection.text.length,
        color: nextColor,
        deferToolbar: Boolean(options?.deferToolbar),
      });
      // Search flash and staged preview both render through epub-ts "highlight".
      // Clear search first so the staged mark does not collide on CFI+renderer type.
      args.engineRef.current?.setTemporarySearchHighlight(null);
      if (stagedSelectionRef.current && previousSource.kind !== "user-selection" && nextSource.kind === "user-selection") {
        onCanceledRef.current?.(previousSource);
      }
      stagedSelectionRef.current = selection;
      stagedSourceRef.current = nextSource;
      noteDraftRef.current = nextNote;
      positionStagedToolbar({
        anchor: selection.anchor,
        toolbarPosition: options?.toolbarPosition,
        deferToolbar: options?.deferToolbar,
      });
      setStagedSelection(selection);
      setStagedSource(nextSource);
      setStagedColor(nextColor);
      setNoteOpen(Boolean(nextNote));
      setNoteDraft(nextNote);
    },
    [positionStagedToolbar],
  );

  const stageSelectionFromCfiRange = useCallback(
    async (input: ProgrammaticStagedSelectionInput) => {
      const cfiRange = input.cfiRange.trim();
      const text = input.text.trim();
      if (!cfiRange || !text) return;
      const selection = { cfiRange, text, quotePrefix: input.quotePrefix, quoteSuffix: input.quoteSuffix };
      const color = input.color?.trim() || "yellow";
      stageSelection(
        selection,
        {
          color,
          note: input.note,
          source: input.source ?? { kind: "user-selection" },
          deferToolbar: true,
        },
      );
      const engine = args.engineRef.current;
      engine?.setHighlightMarks([
        ...highlightMarksRef.current,
        { id: "__staged_selection__", cfiRange, color },
      ]);
      debugStagedSelection("staged mark paint requested", {
        cfiPreview: previewStagedSelectionCfi(cfiRange),
        durableMarkCount: highlightMarksRef.current.length,
        color,
      });
      setStagedToolbarFallback(input.toolbarPosition);
      await reanchorStagedToolbar();
    },
    [args.engineRef, reanchorStagedToolbar, setStagedToolbarFallback, stageSelection],
  );

  const hasStagedSelection = useCallback(() => Boolean(stagedSelectionRef.current), []);

  const onSelectionChanged = useCallback(
    (selection: ReaderSelection | null) => {
      if (!selection) {
        if (stagedSelectionRef.current && stagedSourceRef.current.kind === "user-selection") cancelStaged();
        return;
      }
      stageSelection(selection);
    },
    [cancelStaged, stageSelection],
  );

  const stagedMark: ReaderHighlightMark[] = useMemo(() => {
    return stagedSelection?.cfiRange
      ? [{ id: "__staged_selection__", cfiRange: stagedSelection.cfiRange, color: stagedColor }]
      : [];
  }, [stagedColor, stagedSelection]);

  const combinedMarks = useMemo(() => {
    return [...(args.highlightMarks ?? []), ...stagedMark];
  }, [args.highlightMarks, stagedMark]);

  // Keep engine highlight marks in sync with current durable marks + any staged mark.
  useEffect(() => {
    const engine = args.engineRef.current;
    if (!engine) return;
    debugStagedSelection("synchronizing highlight marks", {
      markCount: combinedMarks.length,
      includesStagedMark: combinedMarks.some((mark) => mark.id === "__staged_selection__"),
    });
    engine.setHighlightMarks(combinedMarks);
  }, [args.engineRef, combinedMarks]);

  // Escape cancels staged highlight without server write.
  useEffect(() => {
    if (!stagedSelection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelStaged();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelStaged, stagedSelection]);

  const commitColor = useCallback(
    async (color: string) => {
      const onCommitHighlight = onCommitHighlightRef.current;
      const selection = stagedSelectionRef.current;
      if (!onCommitHighlight || !selection) return;
      const source = stagedSourceRef.current;
      const noteTrimmed = noteDraftRef.current.trim();
      const previousToolbarPos = toolbarPosRef.current;
      try {
        clearStaged();
        await onCommitHighlight({
          selection,
          color,
          note: noteTrimmed ? noteTrimmed : undefined,
        });
        if (source.kind !== "user-selection") onCommittedRef.current?.(source);
      } catch {
        stageSelection(selection, {
          source,
          color: color.trim() || stagedColorRef.current,
          note: noteTrimmed,
          toolbarPosition: previousToolbarPos,
        });
      }
    },
    [args.engineRef, clearStaged, stageSelection],
  );

  return {
    stagedSelection,
    stagedSelectionRef,
    stagedSource,
    stagedColor,
    noteOpen,
    noteDraft,
    toolbarPos,
    onSelectionChanged,
    cancelStaged,
    hasStagedSelection,
    stageSelectionFromCfiRange,
    reanchorStagedToolbar,
    onToolbarSizeChange,
    setNoteDraft,
    toggleNote: () => setNoteOpen((v) => !v),
    commitColor,
    commitBusy: Boolean(args.commitBusy),
  };
}
