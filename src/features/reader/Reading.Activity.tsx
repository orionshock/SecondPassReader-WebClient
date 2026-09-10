import type { ReaderSettings, ReaderWidth } from "../../storage/ReaderSettings.Store";
import { useEffect, useState } from "react";
import { ReadingSessionOrchestrator } from "./session/ReadingSession.Orchestrator";
import type { OpenedBook } from "./Reader.Types";
import type { SecondPassClient } from "@secondpass/client";
import { useReaderImportJob } from "./imports/ReaderImportJob.Controller";
import { getReaderSettingsPresentation } from "./settings/ReaderDisplaySettings.Presenter";
import { useReaderDisplaySettings } from "./settings/ReaderDisplaySettings.Controller";
import { ReaderActivityDialogs } from "./activity/ReaderActivity.Dialogs";
import { ReaderActivityHeader } from "./activity/ReaderActivity.Header";
import { ReaderActivitySidePanels } from "./activity/ReaderActivity.SidePanels";
import { useReaderActivityImportController } from "./activity/ReaderActivityImport.Controller";
import { useReaderActivityCompletionController } from "./activity/ReaderActivityCompletion.Controller";
import type { ReaderActivityRenderState, ReaderActivityWorkspaceFocusRequest } from "./activity/ReaderActivity.Types";
import { canMutateReaderBookmark } from "./session/annotations/CurrentSessionBookmark.Actions";
import type { BrowserConnectivityStatus } from "../../app/connectivity/BrowserConnectivity.State";
import { selectReaderServerClient } from "./session/ReaderConnectivity.Policy";

export function ReadingActivity({
  openedBook,
  onBackToLibrary,
  spl,
  settings,
  initialSearchQuery,
  connectivity = "unknown",
}: {
  openedBook: OpenedBook | null;
  onBackToLibrary: () => void;
  spl?: SecondPassClient | null;
  settings?: ReaderSettings;
  initialSearchQuery?: string | null;
  connectivity?: BrowserConnectivityStatus;
}) {
  if (!openedBook) return <p className="muted">No book open.</p>;

  const [marginaliaOpen, setMarginaliaOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [workspaceFocusRequest, setWorkspaceFocusRequest] = useState<ReaderActivityWorkspaceFocusRequest | null>(null);
  const readerImport = useReaderImportJob();
  const serverSpl = selectReaderServerClient({ source: openedBook.source, connectivity, client: spl });
  const readerDisplaySettings = useReaderDisplaySettings(settings);
  const displaySettings = readerDisplaySettings.settings;
  const settingsPresentation = getReaderSettingsPresentation(displaySettings);

  return (
    <div
      className="spReaderActivity"
      data-reader-theme={settingsPresentation.activity.theme}
    >
      <ReadingSessionOrchestrator
        openedBook={openedBook}
        spl={serverSpl}
        settings={displaySettings}
        onSettingsChange={readerDisplaySettings.updateSettings}
        onSettingsReset={readerDisplaySettings.resetSettings}
        onStagedSelectionCommitted={(source) => {
          if (source.kind !== "import") return;
          readerImport.markRowAccepted(source.importJobId, source.importRowId);
          readerImport.setDrawerOpen(true);
        }}
        onStagedSelectionCanceled={(source) => {
          if (source.kind !== "import") return;
          readerImport.markRowPending(source.importJobId, source.importRowId);
          readerImport.setDrawerOpen(true);
        }}
        onUnrelatedNavigation={readerImport.cancelStagedRowsForNavigation}
        onOpenAnnotationInWorkspace={(annotationId, mode) => {
          setWorkspaceFocusRequest((prev) => ({ annotationId, mode, seq: (prev?.seq ?? 0) + 1 }));
        }}
      >
        {(readerState) => (
          <ReaderActivityContent
            readerState={readerState}
            openedBook={openedBook}
            onBackToLibrary={onBackToLibrary}
            marginaliaOpen={marginaliaOpen}
            setMarginaliaOpen={setMarginaliaOpen}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            readerImport={readerImport}
            workspaceFocusRequest={workspaceFocusRequest}
            spl={serverSpl}
            initialSearchQuery={initialSearchQuery}
            readerWidth={settingsPresentation.viewport.width}
            connectivity={connectivity}
          />
        )}
      </ReadingSessionOrchestrator>
    </div>
  );
}

function ReaderActivityContent({
  readerState,
  openedBook,
  onBackToLibrary,
  marginaliaOpen,
  setMarginaliaOpen,
  searchOpen,
  setSearchOpen,
  readerImport,
  workspaceFocusRequest,
  spl,
  initialSearchQuery,
  readerWidth,
  connectivity,
}: {
  readerState: ReaderActivityRenderState;
  openedBook: OpenedBook;
  onBackToLibrary: () => void;
  marginaliaOpen: boolean;
  setMarginaliaOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  readerImport: ReturnType<typeof useReaderImportJob>;
  workspaceFocusRequest: { annotationId: string; mode: "editable" | "readonly"; seq: number } | null;
  spl?: SecondPassClient | null;
  initialSearchQuery?: string | null;
  readerWidth: ReaderWidth;
  connectivity: BrowserConnectivityStatus;
}) {
  const { state, statusLine, autosaveStatus, shell, annotations, marginalia } = readerState;
  const currentSessionId = state.sessionId;
  const canBookmark = canMutateReaderBookmark({
    canMutateAnnotations: readerState.canMutateAnnotations,
    cfi: state.location?.cfi,
  });
  const isBookmarked = Boolean(state.location?.cfi && state.annotations.some((a) => a.kind === "bookmark" && a.cfi === state.location?.cfi));
  const selectedPreviousSessionIds = new Set(marginalia.selectedPreviousSessionIds);
  const coverBase = { apiBaseUrl: spl?.config.apiBaseUrl ?? null };
  const activityImport = useReaderActivityImportController({
    readerImport,
    search: readerState.search,
    stagedSelection: readerState.stagedSelection,
    sendCommand: readerState.sendCommand,
    toggleBookmarkAtCurrentLocation: annotations.toggleBookmarkAtCurrentLocation,
  });
  const completion = useReaderActivityCompletionController({
    openedBook,
    spl,
    state,
    closeCurrentSession: annotations.closeCurrentSession,
  });

  useEffect(() => {
    if (!initialSearchQuery?.trim()) return;
    setSearchOpen(true);
  }, [initialSearchQuery, setSearchOpen]);

  return (
    <>
      <ReaderActivityHeader
        title={openedBook.book.title}
        statusLine={statusLine}
        autosaveStatus={autosaveStatus}
        showFinishControls={completion.showFinishControls}
        headerEndLabel={completion.headerEndLabel}
        nextBookAvailable={completion.nextBookAvailable}
        onOpenEndBookDialog={completion.openEndBookDialog}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen(!searchOpen)}
        searchReady={readerState.search.ready}
        canBookmark={canBookmark}
        isBookmarked={isBookmarked}
        annotationBusy={Boolean(annotations.busy)}
        bookmarkSuggested={Boolean(readerImport.bookmarkSuggestion)}
        onToggleBookmark={activityImport.toggleBookmark}
        marginaliaOpen={marginaliaOpen}
        onOpenMarginalia={() => setMarginaliaOpen(true)}
        onCloseMarginalia={() => setMarginaliaOpen(false)}
        marginalia={marginalia}
        selectedPreviousSessionIds={selectedPreviousSessionIds}
        importJobActive={Boolean(readerImport.job)}
        onImportMarginalia={readerState.canMutateAnnotations ? activityImport.openModal : undefined}
        onOpenImport={readerState.canMutateAnnotations ? activityImport.openDrawer : undefined}
        onCloseSession={readerState.canMutateSession && currentSessionId ? completion.openCloseDialog : undefined}
        returnLabel={completion.returnLabel}
        onReturn={completion.returnToTarget}
        showHomeAction={completion.showHomeAction}
        onHome={onBackToLibrary}
        showOfflineStatus={connectivity === "offline" && openedBook.source === "online"}
      />

      <ReaderActivitySidePanels
        importDrawerInLayout={activityImport.drawerInLayout}
        shell={shell}
        annotations={annotations}
        canMutateSession={readerState.canMutateSession}
        canMutateAnnotations={readerState.canMutateAnnotations}
        currentSessionId={currentSessionId}
        currentCfi={state.location?.cfi ?? null}
        workspaceFocusRequest={workspaceFocusRequest}
        onJumpToCfi={readerState.search.jumpToCfi}
        onJumpToCfiRange={readerState.search.jumpToCfiRange}
        readerImport={readerImport}
        readerWidth={readerWidth}
        onClearImport={activityImport.clearJob}
        onCloseImport={activityImport.closeDrawer}
        onSelectImportRow={(rowId) => {
          void activityImport.activateRow(rowId);
        }}
        onMarkImportRowManuallyCompleted={activityImport.markRowManuallyCompleted}
        onSkipImportRow={activityImport.skipRow}
      />

      <ReaderActivityDialogs
        bookId={openedBook.book.id}
        bookTitle={openedBook.book.title}
        searchOpen={searchOpen}
        search={readerState.search}
        initialSearchQuery={initialSearchQuery}
        onCloseSearch={() => {
          readerState.search.clearTemporaryHighlight();
          setSearchOpen(false);
        }}
        importModalOpen={activityImport.modalOpen}
        onCloseImportModal={activityImport.closeModal}
        onStartImport={readerImport.startImport}
        onParseImportAction={activityImport.handleParseAction}
        closeDialogOpen={completion.closeDialogOpen}
        closeInitialName={annotations.currentSessionMeta.name ?? ""}
        closeInitialNotes={annotations.currentSessionMeta.notes ?? ""}
        closeAfterOptions={completion.closeAfterOptions}
        defaultAfterAction={completion.defaultAfterAction}
        nextBook={completion.nextSeriesBook}
        coverBase={coverBase}
        onCancelCloseSession={completion.cancelCloseSession}
        onSaveAndCloseSession={completion.closeSession}
        endBookDialogOpen={completion.endBookDialogOpen}
        nextBookStatus={completion.nextSeriesStatus}
        hasSeries={completion.canLookupNextBook}
        onStartNextBook={completion.startNextBook}
        onFinishSession={completion.finishCurrentSession}
        onKeepReading={completion.keepReading}
        onGoToLibrary={completion.goToReturnTarget}
        returnLabel={completion.returnLabel}
      />
    </>
  );
}
