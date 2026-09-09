import { MaterialIcon } from "../../../components/Material.Icon";
import { InlineMeta } from "../../../components/Metadata.Presenter";
import { MarginaliaMenu } from "../shell/ReaderMarginalia.Menu";
import type { ReaderActivityRenderState } from "./ReaderActivity.Types";

export function ReaderActivityHeader({
  title,
  statusLine,
  autosaveStatus,
  showFinishControls,
  headerEndLabel,
  nextBookAvailable,
  onOpenEndBookDialog,
  searchOpen,
  onToggleSearch,
  searchReady,
  canBookmark,
  isBookmarked,
  annotationBusy,
  bookmarkSuggested,
  onToggleBookmark,
  marginaliaOpen,
  onOpenMarginalia,
  onCloseMarginalia,
  marginalia,
  selectedPreviousSessionIds,
  importJobActive,
  onImportMarginalia,
  onOpenImport,
  onCloseSession,
  returnLabel,
  onReturn,
  showHomeAction,
  onHome,
}: {
  title: string;
  statusLine: string[];
  autosaveStatus: { text: string; title?: string } | null;
  showFinishControls: boolean;
  headerEndLabel: string;
  nextBookAvailable: boolean;
  onOpenEndBookDialog: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  searchReady: boolean;
  canBookmark: boolean;
  isBookmarked: boolean;
  annotationBusy: boolean;
  bookmarkSuggested: boolean;
  onToggleBookmark: () => void;
  marginaliaOpen: boolean;
  onOpenMarginalia: () => void;
  onCloseMarginalia: () => void;
  marginalia: ReaderActivityRenderState["marginalia"];
  selectedPreviousSessionIds: Set<string>;
  importJobActive: boolean;
  onImportMarginalia?: () => void;
  onOpenImport?: () => void;
  onCloseSession?: () => void;
  returnLabel: string;
  onReturn: () => void;
  showHomeAction: boolean;
  onHome: () => void;
}) {
  return (
    <div className="spReaderChrome">
      <div className="spReaderTopBar">
        <div className="spReaderTitle">
          <div className="spReaderTitleLine">{title}</div>
          {statusLine.length ? <div className="spReaderStatusLine muted"><InlineMeta items={statusLine} /></div> : null}
          {autosaveStatus ? (
            <div className="spReaderAutosaveLine muted" title={autosaveStatus.title}>
              {autosaveStatus.text}
            </div>
          ) : null}
        </div>

        <div className="spReaderContextActions" aria-label="Session completion actions">
          {showFinishControls ? (
            <button
              type="button"
              className="button buttonCompact spIconButton"
              onClick={onOpenEndBookDialog}
            >
              <MaterialIcon name={nextBookAvailable ? "arrow_forward" : "flag"} />
              <span className="spIconButtonLabel">{headerEndLabel}</span>
            </button>
          ) : null}
        </div>

        <div className="spReaderActions">
          <button
            type="button"
            className="button buttonCompact spIconButton"
            onClick={onToggleSearch}
            disabled={!searchReady}
            aria-label={searchOpen ? "Close book search" : "Search in book"}
            title={searchReady ? "Search in book" : "Search is unavailable until the reader is ready."}
            aria-pressed={searchOpen}
          >
            <MaterialIcon name="search" />
            <span className="spIconButtonLabel">Search</span>
          </button>

          <button
            type="button"
            className={`button buttonCompact spIconButton${bookmarkSuggested ? " spReaderBookmarkSuggested" : ""}`}
            onClick={onToggleBookmark}
            disabled={!canBookmark || annotationBusy}
            title={!canBookmark ? "Bookmark is unavailable until a reading location is known." : bookmarkSuggested ? "Save imported bookmark" : "Bookmark"}
            aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
          >
            <MaterialIcon name={isBookmarked ? "bookmark_added" : "bookmark_add"} />
            <span className="spIconButtonLabel">{isBookmarked ? "Bookmarked" : "Bookmark"}</span>
          </button>

          <MarginaliaMenu
            open={marginaliaOpen}
            onOpen={onOpenMarginalia}
            onClose={onCloseMarginalia}
            listStatus={marginalia.listStatus}
            listError={marginalia.listError}
            previousLayers={marginalia.previousLayers}
            selectedPreviousSessionIds={selectedPreviousSessionIds}
            onTogglePreviousSession={marginalia.togglePreviousSession}
            importJobActive={importJobActive}
            onImportMarginalia={onImportMarginalia}
            onOpenImport={onOpenImport}
            onCloseSession={onCloseSession}
          />

          <button
            type="button"
            className="button buttonCompact spIconButton"
            onClick={onReturn}
            aria-label={returnLabel}
            title={returnLabel}
          >
            <MaterialIcon name="arrow_back" />
            <span className="spIconButtonLabel">{returnLabel}</span>
          </button>
          {showHomeAction ? (
            <button
              type="button"
              className="button buttonCompact spIconButton"
              onClick={onHome}
              aria-label="Home"
              title="Home"
            >
              <MaterialIcon name="home" />
              <span className="spIconButtonLabel">Home</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
