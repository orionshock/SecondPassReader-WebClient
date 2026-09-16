import type { Author, PaginatedResponse } from "@secondpass/client";
import type { ActiveConnection } from "../../../storage/ActiveConnection.Store";
import { PreviewBookCoverStack } from "../display/PreviewBookCoverStack.UI";
import { LibraryPaginationControls } from "../controls/LibraryPaginationControls.UI";
import { LibraryResultsLoadErrorNotice } from "../LibraryResultsLoadErrorNotice.UI";

type Props = { data: PaginatedResponse<Author> | null; busy: boolean; error: unknown; page: number; connection: ActiveConnection | null; onSelectAuthor: (authorId: string) => void; onViewBook?: (bookId: string) => void; onPageChange: (page: number) => void };

export function LibraryAuthorRows({ data, busy, error, page, connection, onSelectAuthor, onViewBook, onPageChange }: Props) {
  return <>
    {error ? <LibraryResultsLoadErrorNotice error={error} /> : null}
    {busy && !data ? <div className="muted" style={{ marginTop: 10 }}>Loading...</div> : null}
    {data && data.results.length === 0 ? <div className="muted" style={{ marginTop: 10 }}>No authors found.</div> : null}
    {data?.results.length ? <div className="libraryEntityList">{data.results.map((author) => {
      const open = () => onSelectAuthor(String(author.id));
      return <div key={String(author.id)} className="libraryEntityCard">
        <button type="button" className="libraryEntityMain libraryEntityCardButton" onClick={open} aria-label={`View books by ${author.name}`}>
          <span className="libraryEntityTitle">{author.name}</span><span className="muted">{author.bookCount} books</span>
        </button>
        <PreviewBookCoverStack previewBooks={author.previewBooks} baseUrl={connection} onBookClick={onViewBook} />
      </div>;
    })}</div> : null}
    {data ? <LibraryPaginationControls metaItems={[`Page ${page}`, `${data.count} ${data.count === 1 ? "author" : "authors"}`]} busy={busy} hasPrevious={Boolean(data.previous)} hasNext={Boolean(data.next)} onPrevious={() => onPageChange(Math.max(1, page - 1))} onNext={() => onPageChange(page + 1)} /> : null}
  </>;
}
