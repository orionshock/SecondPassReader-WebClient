import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EpubTsBookEngine } from "../engine/EpubTsBookEngine";
import type { ReaderHighlightMark, ReaderSelection } from "../domain/types";

export type StagedSelectionToolbarPos = {
  left: number;
  top: number;
  placement: "above" | "below";
};

export function useStagedSelectionToolbar(args: {
  engineRef: React.MutableRefObject<EpubTsBookEngine | null>;
  mountWrapperRef: React.RefObject<HTMLDivElement | null>;
  highlightMarks?: ReaderHighlightMark[];
  onCommitHighlight?: (input: { selection: ReaderSelection; color: string; note?: string }) => Promise<void>;
  commitBusy?: boolean;
}) {
  const [stagedSelection, setStagedSelection] = useState<ReaderSelection | null>(null);
  const stagedSelectionRef = useRef<ReaderSelection | null>(null);
  const [stagedColor, setStagedColor] = useState<string>("yellow");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [toolbarPos, setToolbarPos] = useState<StagedSelectionToolbarPos | null>(null);

  const highlightMarksRef = useRef<ReaderHighlightMark[]>(args.highlightMarks ?? []);
  useEffect(() => {
    highlightMarksRef.current = args.highlightMarks ?? [];
  }, [args.highlightMarks]);

  useEffect(() => {
    stagedSelectionRef.current = stagedSelection;
  }, [stagedSelection]);

  const cancelStaged = useCallback(() => {
    setStagedSelection(null);
    setStagedColor("yellow");
    setNoteOpen(false);
    setNoteDraft("");
    setToolbarPos(null);
    args.engineRef.current?.clearSelection();
  }, [args.engineRef]);

  const stageSelection = useCallback(
    (selection: ReaderSelection) => {
      // Selecting new text discards any previous uncommitted staged highlight.
      setStagedSelection(selection);
      setStagedColor("yellow");
      setNoteOpen(false);
      setNoteDraft("");

      const wrapper = args.mountWrapperRef.current;
      const anchor = selection.anchor;
      if (wrapper && anchor) {
        const r = wrapper.getBoundingClientRect();
        const left = Math.max(12, Math.min(r.width - 12, anchor.x - r.left));
        const topRaw = Math.max(0, Math.min(r.height, anchor.y - r.top));
        const placement: "above" | "below" = topRaw < 72 ? "below" : "above";
        setToolbarPos({ left, top: topRaw, placement });
      } else if (wrapper) {
        const r = wrapper.getBoundingClientRect();
        setToolbarPos({ left: r.width / 2, top: 18, placement: "below" });
      } else {
        setToolbarPos(null);
      }
    },
    [args.mountWrapperRef],
  );

  const onSelectionChanged = useCallback(
    (selection: ReaderSelection | null) => {
      if (!selection) {
        if (stagedSelectionRef.current) cancelStaged();
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

  // Keep engine highlight marks in sync with current durable marks + any staged mark.
  useEffect(() => {
    const engine = args.engineRef.current;
    if (!engine) return;
    engine.setHighlightMarks([...highlightMarksRef.current, ...stagedMark]);
  }, [args.engineRef, stagedMark]);

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
      if (!args.onCommitHighlight || !stagedSelectionRef.current) return;
      setStagedColor(color);
      try {
        await args.onCommitHighlight({ selection: stagedSelectionRef.current, color });
        cancelStaged();
      } catch {
        // Keep staged highlight + toolbar open on failure.
      }
    },
    [args.onCommitHighlight, cancelStaged],
  );

  const saveNote = useCallback(async () => {
    const sel = stagedSelectionRef.current;
    if (!args.onCommitHighlight || !sel) return;
    try {
      await args.onCommitHighlight({ selection: sel, color: stagedColor, note: noteDraft.trim() });
      cancelStaged();
    } catch {
      // Keep staged highlight + toolbar open on failure.
    }
  }, [args.onCommitHighlight, cancelStaged, noteDraft, stagedColor]);

  return {
    stagedSelection,
    stagedSelectionRef,
    stagedColor,
    noteOpen,
    noteDraft,
    toolbarPos,
    onSelectionChanged,
    cancelStaged,
    setNoteDraft,
    openNote: () => setNoteOpen(true),
    closeNote: () => setNoteOpen(false),
    commitColor,
    saveNote,
    commitBusy: Boolean(args.commitBusy),
  };
}

