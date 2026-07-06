import type { ReaderSearchResult } from "../../domain/types";
import { SEARCH_RESULT_BATCH_SIZE, SEARCH_RESULT_SAFETY_LIMIT, type BookSearchStatus } from "./bookSearchConstants";
import { BookSearchResultRow } from "./BookSearchResultRow";

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
        {!ready ? <span className="muted">Reader is loading.</span> : null}
        {ready && trimmedQuery.length > 0 && trimmedQuery.length < 2 ? <span className="muted">Enter at least 2 characters.</span> : null}
        {status === "searching" ? <span className="muted">Searching...</span> : null}
        {status === "error" && error ? <span className="errorText">{error}</span> : null}
        {resultCountText ? <span className="muted">{resultCountText}</span> : null}
      </div>

      <div className="spBookSearchResults">
        {status === "idle" ? <div className="muted spBookSearchEmpty">Enter a query and press Search.</div> : null}
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
              Show next {Math.min(SEARCH_RESULT_BATCH_SIZE, results.length - visibleCount)}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function getResultCountText(input: { status: BookSearchStatus; loadedCount: number; visibleCount: number }): string | null {
  const showingText = input.loadedCount > input.visibleCount ? ` - showing ${input.visibleCount}` : "";
  if (input.status === "searching") return `Searching... ${input.loadedCount} found${showingText}`;
  if (input.status !== "ready") return null;
  if (input.loadedCount >= SEARCH_RESULT_SAFETY_LIMIT) return `Showing first ${SEARCH_RESULT_SAFETY_LIMIT} results${showingText}`;
  return `${input.loadedCount} result${input.loadedCount === 1 ? "" : "s"}${showingText}`;
}
