import type { LibraryBook, PaginatedResponse } from "@secondpass/client";
import type { LibraryBooksView } from "../../../storage/libraryBooksView";
import { BookResultsView } from "../display/BookResultsView";
import { LibraryPaginationControls } from "../controls/LibraryPaginationControls";

type Props = {
  data: PaginatedResponse<LibraryBook> | null;
  busy: boolean;
  page: number;
  pageSize: number;
  viewMode: LibraryBooksView;
  serverBaseUrl?: string;
  selectedBookId: string | null;
  onViewBook: (book: LibraryBook) => void;
  onPageChange: (page: number) => void;
  hasError?: boolean;
};

export function LibraryBooksResults({ data, busy, page, pageSize, viewMode, serverBaseUrl, selectedBookId, onViewBook, onPageChange, hasError = false }: Props) {
  if (!data && hasError) return null;
  if (!data) return <div className="muted" style={{ marginTop: 10 }}>{busy ? `Loading${"\u2026"}` : "No results yet."}</div>;
  const totalPages = Math.max(1, Math.ceil((data.count ?? 0) / pageSize));
  const metaItems = [`Page ${page} of ${totalPages}`, `${data.count} books`];
  const pagination = {
    metaItems,
    busy,
    hasPrevious: Boolean(data.previous),
    hasNext: Boolean(data.next),
    onPrevious: () => onPageChange(Math.max(1, page - 1)),
    onNext: () => onPageChange(page + 1),
  };
  return (
    <>
      <LibraryPaginationControls {...pagination} />
      <BookResultsView books={data.results} viewMode={viewMode} serverBaseUrl={serverBaseUrl} selectedBookId={selectedBookId} onViewBook={onViewBook} />
      <LibraryPaginationControls {...pagination} stickyBottom />
    </>
  );
}
