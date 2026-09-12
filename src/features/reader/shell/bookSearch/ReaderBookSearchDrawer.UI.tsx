import { useRef } from "react";
import { MaterialIcon } from "../../../../components/MaterialIcon.UI";
import type { ReaderSearchResult } from "../../domain/ReaderDomain.Types";
import type { ReaderSearchBookHandle } from "../../domain/ReaderBridge.Types";
import { BookSearchInputBar } from "./ReaderBookSearchInputBar.UI";
import { BookSearchResultList } from "./ReaderBookSearchResultList.UI";
import { useBookSearchController } from "./ReaderBookSearch.Controller";
import { useModalDialogFocus } from "../../../../components/ModalDialogFocus.Lifecycle";

export function BookSearchDrawer({
  open,
  ready,
  searchBook,
  bookTitle,
  initialSearchQuery,
  onClose,
  onJump,
}: {
  open: boolean;
  ready: boolean;
  searchBook: ReaderSearchBookHandle | null;
  bookTitle?: string | null;
  initialSearchQuery?: string | null;
  onClose: () => void;
  onJump: (result: ReaderSearchResult) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const search = useBookSearchController({ open, ready, searchBook, initialSearchQuery });

  useModalDialogFocus({ active: open, dialogRef: panelRef, initialFocusRef: search.inputRef, onDismiss: onClose });

  if (!open) return null;

  return (
    <div
      className="spBookSearchBackdrop"
      role="presentation"
      onPointerDown={(e) => {
        if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
        onClose();
      }}
    >
      <aside
        ref={panelRef}
        className="spBookSearchDrawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sp-book-search-title"
        tabIndex={-1}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="spBookSearchHeader">
          <h2 id="sp-book-search-title" className="spBookSearchTitle">Search in book</h2>
          <button type="button" className="button buttonCompact spBookSearchCloseButton" onClick={onClose} aria-label="Close search" title="Close">
            <MaterialIcon name="close" />
          </button>
        </div>

        <BookSearchInputBar
          inputRef={search.inputRef}
          query={search.query}
          ready={ready}
          canSubmitSearch={search.canSubmitSearch}
          onQueryChange={search.setQuery}
          onSubmit={search.runSearch}
        />

        <BookSearchResultList
          ready={ready}
          trimmedQuery={search.trimmedQuery}
          status={search.status}
          error={search.error}
          results={search.results}
          visibleResults={search.visibleResults}
          visibleCount={search.visibleCount}
          searchedQuery={search.searchedQuery}
          selectedResultId={search.selectedResultId}
          bookTitle={bookTitle}
          onSelectResult={(result) => {
            search.setSelectedResultId(result.id);
            onJump(result);
          }}
          onShowMore={search.showMore}
        />
      </aside>
    </div>
  );
}
