import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navigateTo } from "../../../app/AppNavigation.Router";
import { completeReaderImportRowManually } from "../imports/ReaderImportManualCompletion.Actions";
import type { ReaderImportFailureAction } from "../imports/ReaderImportFormats.Registry";
import { useReaderImportActivation } from "../imports/ReaderImportActivation.Controller";
import type { useReaderImportJob } from "../imports/ReaderImportJob.Controller";
import type { ReaderBookmarkMutationResult } from "../session/annotations/CurrentSessionBookmark.Actions";
import type { ReaderActivityRenderState } from "./ReaderActivity.Types";

export function shouldAcceptImportedBookmarkMutation(result: ReaderBookmarkMutationResult): boolean {
  return result.ok && result.action === "created";
}

export function useReaderActivityImportController({
  readerImport,
  search,
  stagedSelection,
  sendCommand,
  toggleBookmarkAtCurrentLocation,
}: {
  readerImport: ReturnType<typeof useReaderImportJob>;
  search: ReaderActivityRenderState["search"];
  stagedSelection: ReaderActivityRenderState["stagedSelection"];
  sendCommand: ReaderActivityRenderState["sendCommand"];
  toggleBookmarkAtCurrentLocation: ReaderActivityRenderState["annotations"]["toggleBookmarkAtCurrentLocation"];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const drawerInLayout = Boolean(readerImport.drawerOpen && readerImport.job);
  const lastDrawerLayoutRef = useRef(drawerInLayout);
  const activateRow = useReaderImportActivation({
    job: readerImport.job,
    searchBook: search.searchBook,
    probeCfi: search.probeCfi,
    displayCfi: search.displayCfi,
    stagedSelectionHandle: stagedSelection.handle,
    selectRow: readerImport.selectRow,
    setRowStatus: readerImport.setRowStatus,
    setRowActivationState: readerImport.setRowActivationState,
    setDrawerOpen: readerImport.setDrawerOpen,
    clearTemporaryHighlight: search.clearTemporaryHighlight,
    onBookmarkSuggested: readerImport.suggestBookmark,
  });

  useEffect(() => {
    if (lastDrawerLayoutRef.current === drawerInLayout) return;
    lastDrawerLayoutRef.current = drawerInLayout;
    let cancelled = false;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) sendCommand({ type: "resize" });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [drawerInLayout, sendCommand]);

  const cleanupTemporaryState = useCallback(() => {
    stagedSelection.handle?.cancelStagedSelection();
    search.clearTemporaryHighlight();
  }, [search.clearTemporaryHighlight, stagedSelection.handle]);

  const clearJob = useCallback(() => {
    cleanupTemporaryState();
    readerImport.clearJob();
  }, [cleanupTemporaryState, readerImport.clearJob]);

  const closeDrawer = useCallback(() => {
    cleanupTemporaryState();
    readerImport.setDrawerOpen(false);
  }, [cleanupTemporaryState, readerImport.setDrawerOpen]);

  const skipRow = useCallback((rowId: string) => {
    const row = readerImport.job?.rows.find((item) => item.id === rowId);
    if (row?.status === "staged") stagedSelection.handle?.cancelStagedSelection();
    search.clearTemporaryHighlight();
    readerImport.skipRow(rowId);
  }, [readerImport.job, readerImport.skipRow, search.clearTemporaryHighlight, stagedSelection.handle]);

  const markRowManuallyCompleted = useCallback((rowId: string) => {
    completeReaderImportRowManually({
      row: readerImport.job?.rows.find((item) => item.id === rowId),
      cancelStagedSelection: () => stagedSelection.handle?.cancelStagedSelection(),
      clearTemporaryHighlight: search.clearTemporaryHighlight,
      markRowManuallyCompleted: readerImport.markRowManuallyCompleted,
    });
  }, [readerImport.job, readerImport.markRowManuallyCompleted, search.clearTemporaryHighlight, stagedSelection.handle]);

  const toggleBookmark = useCallback(() => {
    const suggestion = readerImport.bookmarkSuggestion;
    void toggleBookmarkAtCurrentLocation().then((result) => {
      if (suggestion && shouldAcceptImportedBookmarkMutation(result)) {
        readerImport.acceptBookmarkSuggestion(suggestion.cfi);
      }
    });
  }, [readerImport.acceptBookmarkSuggestion, readerImport.bookmarkSuggestion, toggleBookmarkAtCurrentLocation]);

  const handleParseAction = useCallback((action: ReaderImportFailureAction) => {
    setModalOpen(false);
    if (action.href === "#/settings?tab=tools") navigateTo({ kind: "settings", tab: "tools" });
    else window.location.hash = action.href;
  }, []);

  const openModal = useCallback(() => setModalOpen(true), []);
  const closeModal = useCallback(() => setModalOpen(false), []);
  const openDrawer = useCallback(() => readerImport.setDrawerOpen(true), [readerImport.setDrawerOpen]);

  return useMemo(() => ({
    modalOpen,
    openModal,
    closeModal,
    handleParseAction,
    drawerInLayout,
    openDrawer,
    clearJob,
    closeDrawer,
    activateRow,
    markRowManuallyCompleted,
    skipRow,
    toggleBookmark,
  }), [activateRow, clearJob, closeDrawer, closeModal, drawerInLayout, handleParseAction, markRowManuallyCompleted, modalOpen, openDrawer, openModal, skipRow, toggleBookmark]);
}
