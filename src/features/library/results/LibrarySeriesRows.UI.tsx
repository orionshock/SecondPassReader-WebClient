import type { Series, PaginatedResponse } from "@secondpass/client";
import type { ActiveConnection } from "../../../storage/ActiveConnection.Store";
import { PreviewBookCoverStack } from "../display/PreviewBookCoverStack.UI";
import { CollectionPagination } from "../../../components/CollectionPagination.UI";
import { APP_PAGE_SIZE_OPTIONS } from "../../../app/AppNavigation.Constants";
import { LibraryResultsLoadErrorNotice } from "../LibraryResultsLoadErrorNotice.UI";

type Props = { data: PaginatedResponse<Series> | null; busy: boolean; error: unknown; page: number; pageSize: number; connection: ActiveConnection | null; onSelectSeries: (seriesId: string) => void; onViewBook?: (bookId: string) => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void };

export function LibrarySeriesRows({ data, busy, error, page, pageSize, connection, onSelectSeries, onViewBook, onPageChange, onPageSizeChange }: Props) {
  return <>
    {error ? <LibraryResultsLoadErrorNotice error={error} /> : null}
    {busy && !data ? <div className="muted" style={{ marginTop: 10 }}>Loading...</div> : null}
    {data && data.results.length === 0 ? <div className="muted" style={{ marginTop: 10 }}>No series found.</div> : null}
    {data ? <CollectionPagination page={page} total={data.count} pageSize={{ value: pageSize, options: APP_PAGE_SIZE_OPTIONS, onChange: onPageSizeChange }} busy={busy} hasPrevious={Boolean(data.previous)} hasNext={Boolean(data.next)} onPrevious={() => onPageChange(Math.max(1, page - 1))} onNext={() => onPageChange(page + 1)} /> : null}
    {data?.results.length ? <div className="libraryEntityList">{data.results.map((series) => {
      const open = () => onSelectSeries(String(series.id));
      return <div key={String(series.id)} className="libraryEntityCard" onClick={open}>
        <button type="button" className="libraryEntityMain libraryEntityCardButton" aria-label={`View books in ${series.name}`}>
          <span className="libraryEntityTitle">{series.name}</span><span className="muted">{series.bookCount} books</span>
        </button>
        <PreviewBookCoverStack previewBooks={series.previewBooks} baseUrl={connection} onBookClick={onViewBook} />
      </div>;
    })}</div> : null}
  </>;
}
