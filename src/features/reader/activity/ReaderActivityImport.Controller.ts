import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navigateTo } from "../../../app/AppNavigation.Router";
import { completeReaderImportRowManually } from "../imports/ReaderImportManualCompletion.Actions";
import type { ReaderImportFailureAction } from "../imports/ReaderImportFormats.Registry";
import { useReaderImportActivation } from "../imports/ReaderImportActivation.Controller";
import type { useReaderImportJob } from "../imports/ReaderImportJob.Controller";
import type { ReaderBookmarkMutationResult } from "../session/annotations/CurrentSessionBookmark.Actions";
import type { ReaderActivityRenderState } from "./ReaderActivity.Types";
import type { CurrentSessionAnnotationCapability } from "../session/CurrentSessionAuthority.Controller";

export function shouldAcceptImportedBookmarkMutation(result: ReaderBookmarkMutationResult): boolean {
  return result.ok && result.action === "created";
}

export function useReaderActivityImportController({
  readerImport,
  renderer,
  annotations,
}: {
  readerImport: ReturnType<typeof useReaderImportJob>;
  renderer: ReaderActivityRenderState["renderer"];
  annotations: CurrentSessionAnnotationCapability | null;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const drawerInLayout = Boolean(readerImport.drawerOpen && readerImport.job);
  const lastDrawerLayoutRef = useRef(drawerInLayout);
  const capability = renderer.capability;
  const activation = useReaderImportActivation({
    job: readerImport.job,
    reviewOpen: readerImport.drawerOpen,
    lifetime: readerImport.reviewLifetime,
    searchBook: capability?.searchBook ?? null,
    probeCfi: capability?.probeCfi ?? null,
    displayCfi: capability?.displayCfi ?? null,
    stagedSelectionHandle: capability?.stagedSelection ?? null,
    selectRow: readerImport.selectRow,
    setRowStatus: readerImport.setRowStatus,
    setRowActivationState: readerImport.setRowActivationState,
    setDrawerOpen: readerImport.setDrawerOpen,
    clearTemporaryHighlight: renderer.clearTemporaryHighlight,
    onBookmarkSuggested: readerImport.suggestBookmark,
  });

  useEffect(() => {
    if (lastDrawerLayoutRef.current === drawerInLayout) return;
    lastDrawerLayoutRef.current = drawerInLayout;
    // The runtime that measures the Reader mount owns layout settling and stale-request checks.
    renderer.sendCommand({ type: "resize" });
  }, [drawerInLayout, renderer.sendCommand]);

  const cleanupTemporaryState = useCallback(() => {
    capability?.stagedSelection.cancelStagedSelection();
    renderer.clearTemporaryHighlight();
  }, [capability, renderer.clearTemporaryHighlight]);

  useEffect(() => {
    activation.invalidate();
  }, [activation.invalidate, readerImport.job?.id]);

  const clearJob = useCallback(() => {
    activation.invalidate();
    cleanupTemporaryState();
    readerImport.clearJob();
  }, [activation.invalidate, cleanupTemporaryState, readerImport.clearJob]);

  const closeDrawer = useCallback(() => {
    activation.invalidate();
    cleanupTemporaryState();
    readerImport.setDrawerOpen(false);
  }, [activation.invalidate, cleanupTemporaryState, readerImport.setDrawerOpen]);

  const skipRow = useCallback((rowId: string) => {
    activation.invalidate();
    const row = readerImport.job?.rows.find((item) => item.id === rowId);
    if (row?.status === "staged") capability?.stagedSelection.cancelStagedSelection();
    renderer.clearTemporaryHighlight();
    readerImport.skipRow(rowId);
  }, [activation.invalidate, capability, readerImport.job, readerImport.skipRow, renderer.clearTemporaryHighlight]);

  const markRowManuallyCompleted = useCallback((rowId: string) => {
    activation.invalidate();
    completeReaderImportRowManually({
      row: readerImport.job?.rows.find((item) => item.id === rowId),
      cancelStagedSelection: () => capability?.stagedSelection.cancelStagedSelection(),
      clearTemporaryHighlight: renderer.clearTemporaryHighlight,
      markRowManuallyCompleted: readerImport.markRowManuallyCompleted,
    });
  }, [activation.invalidate, capability, readerImport.job, readerImport.markRowManuallyCompleted, renderer.clearTemporaryHighlight]);

  const startImport = useCallback(async (format: string, file: File) => {
    activation.invalidate();
    cleanupTemporaryState();
    return readerImport.startImport(format, file);
  }, [activation.invalidate, cleanupTemporaryState, readerImport.startImport]);

  const toggleBookmark = useCallback(() => {
    const suggestion = readerImport.bookmarkSuggestion;
    if (!annotations) return;
    void annotations.toggleBookmarkAtCurrentLocation().then((result) => {
      if (suggestion && shouldAcceptImportedBookmarkMutation(result)) {
        readerImport.acceptBookmarkSuggestion(suggestion);
      }
    });
  }, [annotations, readerImport.acceptBookmarkSuggestion, readerImport.bookmarkSuggestion]);

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
    activateRow: activation.activateRow,
    startImport,
    markRowManuallyCompleted,
    skipRow,
    toggleBookmark,
  }), [activation.activateRow, clearJob, closeDrawer, closeModal, drawerInLayout, handleParseAction, markRowManuallyCompleted, modalOpen, openDrawer, openModal, skipRow, startImport, toggleBookmark]);
}
