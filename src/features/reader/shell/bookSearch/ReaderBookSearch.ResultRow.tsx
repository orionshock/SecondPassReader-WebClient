import type { ReaderSearchResult } from "../../domain/ReaderDomain.Types";
import { getSearchResultDisplayLabel } from "./ReaderBookSearch.Labels";
import { renderHighlightedExcerpt } from "./ReaderBookSearch.Text";

export function BookSearchResultRow({
  result,
  bookTitle,
  searchedQuery,
  selected,
  onJump,
}: {
  result: ReaderSearchResult;
  bookTitle?: string | null;
  searchedQuery: string;
  selected: boolean;
  onJump: (result: ReaderSearchResult) => void;
}) {
  return (
    <article className="spBookSearchResult">
      <button
        type="button"
        className={`spBookSearchResultButton${selected ? " spBookSearchResultButtonSelected" : ""}`}
        onClick={() => onJump(result)}
        aria-current={selected ? "location" : undefined}
      >
        <span className="spBookSearchResultLabel">{getSearchResultDisplayLabel(result, bookTitle)}</span>
        <span className="spBookSearchExcerpt" title={result.excerpt}>
          {renderHighlightedExcerpt(result.excerpt, searchedQuery)}
        </span>
      </button>
    </article>
  );
}
