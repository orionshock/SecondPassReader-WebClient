import type { KeyboardEvent } from "react";
import type { LibraryAuthor, PaginatedResponse } from "@secondpass/client";
import type { ConnectionProfile } from "../../../storage/connectionProfiles";
import { CoverPreviewStrip } from "../display/CoverPreviewStrip";
import { LibraryPaginationControls } from "../controls/LibraryPaginationControls";

type Props = { data: PaginatedResponse<LibraryAuthor> | null; busy: boolean; error: string | null; page: number; profile: ConnectionProfile | null; onSelectAuthor: (authorId: string) => void; onViewBook?: (bookId: string) => void; onPageChange: (page: number) => void };

export function LibraryAuthorRows({ data, busy, error, page, profile, onSelectAuthor, onViewBook, onPageChange }: Props) {
  const keyDown = (event: KeyboardEvent<HTMLElement>, action: () => void) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(); } };
  return <>
    {error ? <p className="errorText">{error}</p> : null}
    {busy && !data ? <div className="muted" style={{ marginTop: 10 }}>{`Loading${"\u2026"}`}</div> : null}
    {data?.results.length ? <div className="libraryEntityList">{data.results.map((author) => {
      const open = () => onSelectAuthor(String(author.id));
      return <div key={String(author.id)} className="libraryEntityCard libraryEntityCardButton" role="button" tabIndex={0} onClick={open} onKeyDown={(event) => keyDown(event, open)} aria-label={`View books by ${author.name}`} title={`View books by ${author.name}`}>
        <div className="libraryEntityMain"><div className="libraryEntityTitle">{author.name}</div>{typeof author.book_count === "number" ? <div className="muted">{author.book_count} books</div> : null}</div>
        <CoverPreviewStrip books={author.preview_books} baseUrl={profile} onBookClick={onViewBook} />
      </div>;
    })}</div> : null}
    {data ? <LibraryPaginationControls metaItems={[`Page ${page}`, `${data.count} authors`]} busy={busy} hasPrevious={Boolean(data.previous)} hasNext={Boolean(data.next)} onPrevious={() => onPageChange(Math.max(1, page - 1))} onNext={() => onPageChange(page + 1)} /> : null}
  </>;
}
