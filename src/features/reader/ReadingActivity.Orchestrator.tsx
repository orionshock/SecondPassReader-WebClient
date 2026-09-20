import type { ReaderSettings, ReaderWidth } from "../../storage/ReaderSettings.Store";
import { useEffect, useState } from "react";
import { ReadingSessionOrchestrator } from "./session/ReadingSession.Orchestrator";
import type { OpenedBook } from "./Reader.Types";
import type { SecondPassClient } from "@secondpass/client";
import { useReaderImportJob } from "./imports/ReaderImportJob.Controller";
import { getReaderSettingsPresentation } from "./settings/ReaderDisplaySettings.Presenter";
import { useReaderDisplaySettings } from "./settings/ReaderDisplaySettings.Controller";
import { ReaderActivityDialogs } from "./activity/ReaderActivityDialogs.UI";
import { ReaderActivityHeader } from "./activity/ReaderActivityHeader.UI";
import { ReaderActivitySidePanels } from "./activity/ReaderActivitySidePanels.UI";
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
  offlineNamespaceKey = null,
}: {
  openedBook: OpenedBook | null;
  onBackToLibrary: () => void;
  spl?: SecondPassClient | null;
  settings?: ReaderSettings;
  initialSearchQuery?: string | null;
  connectivity?: BrowserConnectivityStatus;
  offlineNamespaceKey?: string | null;
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
        connectivity={connectivity}
        offlineNamespaceKey={offlineNamespaceKey}
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
  const { state, presentation, shell, annotations, marginalia, authority, administration, renderer } = readerState;
  const annotationCapability = authority.annotations;
  const currentSessionId = state.sessionId;
  const canBookmark = canMutateReaderBookmark({
    canMutateAnnotations: authority.writable,
    cfi: state.location?.cfi,
  });
  const isBookmarked = Boolean(state.location?.cfi && state.annotations.some((a) => a.kind === "bookmark" && a.cfi === state.location?.cfi));
  const selectedPreviousSessionIds = new Set(marginalia.selectedPreviousSessionIds);
  const coverBase = { apiRootUrl: spl?.config.apiRootUrl ?? null };
  const activityImport = useReaderActivityImportController({
    readerImport,
    renderer,
    annotations: annotationCapability,
  });
  const completion = useReaderActivityCompletionController({
    openedBook,
    spl,
    state,
    closeCurrentSession: administration.closeCurrentSession,
  });

  useEffect(() => {
    if (!initialSearchQuery?.trim()) return;
    setSearchOpen(true);
  }, [initialSearchQuery, setSearchOpen]);

  return (
    <>
      <ReaderActivityHeader
        title={openedBook.book.title}
        statusLine={presentation.statusLine}
        autosaveStatus={presentation.autosaveStatus}
        showFinishControls={completion.showFinishControls}
        headerEndLabel={completion.headerEndLabel}
        nextBookAvailable={completion.nextBookAvailable}
        onOpenEndBookDialog={completion.openEndBookDialog}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen(!searchOpen)}
        searchReady={renderer.ready}
        canBookmark={canBookmark}
        isBookmarked={isBookmarked}
        annotationBusy={Boolean(annotationCapability?.busy)}
        bookmarkSuggested={Boolean(readerImport.bookmarkSuggestion)}
        onToggleBookmark={activityImport.toggleBookmark}
        marginaliaOpen={marginaliaOpen}
        onOpenMarginalia={() => setMarginaliaOpen(true)}
        onCloseMarginalia={() => setMarginaliaOpen(false)}
        marginalia={marginalia}
        selectedPreviousSessionIds={selectedPreviousSessionIds}
        importJobActive={Boolean(readerImport.job)}
        onImportMarginalia={authority.writable ? activityImport.openModal : undefined}
        onOpenImport={authority.writable ? activityImport.openDrawer : undefined}
        onCloseSession={administration.writable && currentSessionId ? completion.openCloseDialog : undefined}
        returnLabel={completion.returnLabel}
        onReturn={completion.returnToTarget}
        showHomeAction={completion.showHomeAction}
        onHome={onBackToLibrary}
        offlineStatus={connectivity === "offline"
          ? authority.writable
            ? "Offline. Changes will sync when connected."
            : "Offline. Changes aren't available."
          : null}
      />

      <ReaderActivitySidePanels
        importDrawerInLayout={activityImport.drawerInLayout}
        shell={shell}
        annotations={annotations}
        administration={administration}
        authority={authority}
        currentSessionId={currentSessionId}
        currentCfi={state.location?.cfi ?? null}
        workspaceFocusRequest={workspaceFocusRequest}
        onJumpToCfi={renderer.jumpToCfi}
        onJumpToCfiRange={renderer.jumpToCfiRange}
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
        renderer={renderer}
        initialSearchQuery={initialSearchQuery}
        onCloseSearch={() => {
          renderer.clearTemporaryHighlight();
          setSearchOpen(false);
        }}
        importModalOpen={activityImport.modalOpen}
        onCloseImportModal={activityImport.closeModal}
        onStartImport={activityImport.startImport}
        onParseImportAction={activityImport.handleParseAction}
        closeDialogOpen={completion.closeDialogOpen}
        closeInitialName={administration.currentSessionMeta.name ?? ""}
        closeInitialNotes={administration.currentSessionMeta.notes ?? ""}
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
