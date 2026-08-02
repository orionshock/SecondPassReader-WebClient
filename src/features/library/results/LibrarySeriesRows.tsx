import type { KeyboardEvent } from "react";
import type { LibrarySeries, PaginatedResponse } from "@secondpass/client";
import type { ConnectionProfile } from "../../../storage/connectionProfiles";
import { PreviewBookCoverStack } from "../display/PreviewBookCoverStack";
import { normalizePreviewBooks } from "../display/previewBooks";
import { LibraryPaginationControls } from "../controls/LibraryPaginationControls";
import { LibraryResultsLoadErrorNotice } from "../LibraryResultsLoadErrorNotice";

type Props = { data: PaginatedResponse<LibrarySeries> | null; busy: boolean; error: unknown; page: number; profile: ConnectionProfile | null; onSelectSeries: (seriesId: string) => void; onViewBook?: (bookId: string) => void; onPageChange: (page: number) => void };

export function LibrarySeriesRows({ data, busy, error, page, profile, onSelectSeries, onViewBook, onPageChange }: Props) {
  const keyDown = (event: KeyboardEvent<HTMLElement>, action: () => void) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(); } };
  return <>
    {error ? <LibraryResultsLoadErrorNotice error={error} /> : null}
    {busy && !data ? <div className="muted" style={{ marginTop: 10 }}>{`Loading${"\u2026"}`}</div> : null}
    {data?.results.length ? <div className="libraryEntityList">{data.results.map((series) => {
      const open = () => onSelectSeries(String(series.id));
      return <div key={String(series.id)} className="libraryEntityCard libraryEntityCardButton" role="button" tabIndex={0} onClick={open} onKeyDown={(event) => keyDown(event, open)} aria-label={`View books in ${series.name}`} title={`View books in ${series.name}`}>
        <div className="libraryEntityMain"><div className="libraryEntityTitle">{series.name}</div>{typeof series.book_count === "number" ? <div className="muted">{series.book_count} books</div> : null}</div>
        <PreviewBookCoverStack previewBooks={normalizePreviewBooks(series.preview_books)} baseUrl={profile} onBookClick={onViewBook} />
      </div>;
    })}</div> : null}
    {data ? <LibraryPaginationControls metaItems={[`Page ${page}`, `${data.count} series`]} busy={busy} hasPrevious={Boolean(data.previous)} hasNext={Boolean(data.next)} onPrevious={() => onPageChange(Math.max(1, page - 1))} onNext={() => onPageChange(page + 1)} /> : null}
  </>;
}
