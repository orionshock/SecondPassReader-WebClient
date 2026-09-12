import type { ReaderSearchResult } from "../../domain/ReaderDomain.Types";
import { SEARCH_RESULT_BATCH_SIZE, SEARCH_RESULT_SAFETY_LIMIT, type BookSearchStatus } from "./ReaderBookSearch.Constants";
import { BookSearchResultRow } from "./ReaderBookSearchResultRow.UI";

export function BookSearchResultList({
  ready,
  trimmedQuery,
  status,
  error,
  results,
  visibleResults,
  visibleCount,
  searchedQuery,
  selectedResultId,
  bookTitle,
  onSelectResult,
  onShowMore,
}: {
  ready: boolean;
  trimmedQuery: string;
  status: BookSearchStatus;
  error: string | null;
  results: ReaderSearchResult[];
  visibleResults: ReaderSearchResult[];
  visibleCount: number;
  searchedQuery: string;
  selectedResultId: string | null;
  bookTitle?: string | null;
  onSelectResult: (result: ReaderSearchResult) => void;
  onShowMore: () => void;
}) {
  const resultCountText = getResultCountText({ status, loadedCount: results.length, visibleCount: visibleResults.length });
  const canShowMore = visibleCount < results.length;

  return (
    <>
      <div className="spBookSearchMeta" aria-live="polite">
        {!ready ? <span className="muted">Loading reader...</span> : null}
        {ready && trimmedQuery.length > 0 && trimmedQuery.length < 2 ? <span className="muted">Enter at least 2 characters.</span> : null}
        {status === "searching" ? <span className="muted">Searching...</span> : null}
        {status === "error" && error ? <span className="errorText">{error}</span> : null}
        {resultCountText ? <span className="muted">{resultCountText}</span> : null}
      </div>

      <div className="spBookSearchResults">
        {status === "idle" ? <div className="muted spBookSearchEmpty">Enter text to search this book.</div> : null}
        {status === "ready" && results.length === 0 ? (
          <div className="muted spBookSearchEmpty">No results for "{searchedQuery}".</div>
        ) : null}
        {visibleResults.map((result) => (
          <BookSearchResultRow
            key={result.id}
            result={result}
            bookTitle={bookTitle}
            searchedQuery={searchedQuery}
            selected={selectedResultId === result.id}
            onJump={onSelectResult}
          />
        ))}
        {canShowMore ? (
          <div className="spBookSearchShowMoreRow">
            <button type="button" className="button buttonCompact" onClick={onShowMore}>
              Show {Math.min(SEARCH_RESULT_BATCH_SIZE, results.length - visibleCount)} more
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function getResultCountText(input: { status: BookSearchStatus; loadedCount: number; visibleCount: number }): string | null {
  if (input.status === "searching") return null;
  if (input.status !== "ready") return null;
  if (input.loadedCount === 0) return null;
  if (input.loadedCount >= SEARCH_RESULT_SAFETY_LIMIT) return `First ${SEARCH_RESULT_SAFETY_LIMIT} results`;
  if (input.loadedCount > input.visibleCount) return `Showing ${input.visibleCount} of ${input.loadedCount} results`;
  return `${input.loadedCount} result${input.loadedCount === 1 ? "" : "s"}`;
}
