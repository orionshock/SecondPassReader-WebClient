import type { CompactBook, PaginatedResponse } from "@secondpass/client";
import type { LibraryBooksView } from "../../../storage/LibraryBooksView.Store";
import { BookResultsView } from "../display/BookResultsView.UI";
import { CollectionPagination } from "../../../components/CollectionPagination.UI";
import { APP_PAGE_SIZE_OPTIONS } from "../../../app/AppNavigation.Constants";

type Props = {
  data: PaginatedResponse<CompactBook> | null;
  busy: boolean;
  page: number;
  pageSize: number;
  viewMode: LibraryBooksView;
  serverBaseUrl?: string;
  selectedBookId: string | null;
  onViewBook: (book: CompactBook) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  hasError?: boolean;
};

export function LibraryBooksResults({ data, busy, page, pageSize, viewMode, serverBaseUrl, selectedBookId, onViewBook, onPageChange, onPageSizeChange, hasError = false }: Props) {
  if (!data && hasError) return null;
  if (!data) return <div className="muted" style={{ marginTop: 10 }}>{busy ? "Loading..." : "No books found."}</div>;
  const pagination = {
    page,
    total: data.count,
    pageSize: { value: pageSize, options: APP_PAGE_SIZE_OPTIONS, onChange: onPageSizeChange },
    busy,
    hasPrevious: Boolean(data.previous),
    hasNext: Boolean(data.next),
    onPrevious: () => onPageChange(Math.max(1, page - 1)),
    onNext: () => onPageChange(page + 1),
  };
  return (
    <>
      <CollectionPagination {...pagination} />
      <BookResultsView books={data.results} viewMode={viewMode} serverBaseUrl={serverBaseUrl} selectedBookId={selectedBookId} onViewBook={onViewBook} />
      <CollectionPagination {...pagination} stickyBottom />
    </>
  );
}
