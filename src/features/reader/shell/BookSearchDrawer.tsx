import { useEffect, useRef, useState } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon";
import type { ReaderSearchOptions, ReaderSearchResult } from "../domain/types";

type SearchStatus = "idle" | "searching" | "ready" | "error";
const SEARCH_RESULT_BATCH_SIZE = 50;
const SEARCH_RESULT_SAFETY_LIMIT = 1000;

export function BookSearchDrawer({
  open,
  ready,
  searchBook,
  bookTitle,
  onClose,
  onJump,
}: {
  open: boolean;
  ready: boolean;
  searchBook: ((query: string, options?: ReaderSearchOptions) => Promise<ReaderSearchResult[]>) | null;
  bookTitle?: string | null;
  onClose: () => void;
  onJump: (result: ReaderSearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [results, setResults] = useState<ReaderSearchResult[]>([]);
  const [visibleCount, setVisibleCount] = useState(SEARCH_RESULT_BATCH_SIZE);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const trimmed = query.trim();
  const canSearch = ready && Boolean(searchBook) && trimmed.length >= 2 && status !== "searching";

  const runSearch = () => {
    if (!searchBook) return;
    if (trimmed.length < 2) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("searching");
    setError(null);
    setSearchedQuery(trimmed);
    setResults([]);
    setVisibleCount(SEARCH_RESULT_BATCH_SIZE);

    void (async () => {
      try {
        const next = await searchBook(trimmed, {
          maxResults: SEARCH_RESULT_SAFETY_LIMIT,
          maxSeqEle: 6,
          signal: controller.signal,
          onProgress: (partial) => {
            if (requestIdRef.current !== requestId || controller.signal.aborted) return;
            setResults(partial);
          },
        });
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        setResults(next);
        setStatus("ready");
      } catch (err) {
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Search failed.");
        setStatus("error");
      }
    })();
  };

  const visibleResults = results.slice(0, visibleCount);
  const canShowMore = visibleCount < results.length;
  const resultCountText = getResultCountText({ status, loadedCount: results.length });

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
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="spBookSearchHeader">
          <h2 id="sp-book-search-title" className="spBookSearchTitle">Search in book</h2>
          <button type="button" className="button buttonCompact spBookSearchCloseButton" onClick={onClose} aria-label="Close search" title="Close">
            <MaterialIcon name="close" />
          </button>
        </div>

        <form
          className="spBookSearchForm"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <input
            ref={inputRef}
            className="input spBookSearchInput"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search text"
            aria-label="Search text"
            disabled={!ready}
          />
          <button type="submit" className="button buttonPrimary spBookSearchButton" disabled={!canSearch}>
            Search
          </button>
        </form>

        <div className="spBookSearchMeta" aria-live="polite">
          {!ready ? <span className="muted">Reader is loading.</span> : null}
          {ready && trimmed.length > 0 && trimmed.length < 2 ? <span className="muted">Enter at least 2 characters.</span> : null}
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
            <article key={result.id} className="spBookSearchResult">
              <button type="button" className="spBookSearchResultButton" onClick={() => onJump(result)}>
                <span className="spBookSearchResultLabel">{getSearchResultDisplayLabel(result, bookTitle)}</span>
                <span className="spBookSearchExcerpt" title={result.excerpt}>
                  {renderHighlightedExcerpt(result.excerpt, searchedQuery)}
                </span>
              </button>
            </article>
          ))}
          {canShowMore ? (
            <div className="spBookSearchShowMoreRow">
              <button
                type="button"
                className="button buttonCompact"
                onClick={() => setVisibleCount((count) => count + SEARCH_RESULT_BATCH_SIZE)}
              >
                Show next {Math.min(SEARCH_RESULT_BATCH_SIZE, results.length - visibleCount)}
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function getResultCountText(input: { status: SearchStatus; loadedCount: number }): string | null {
  if (input.status === "searching") {
    return `Searching... ${input.loadedCount} found`;
  }
  if (input.status !== "ready") return null;
  if (input.loadedCount >= SEARCH_RESULT_SAFETY_LIMIT) {
    return `Showing first ${SEARCH_RESULT_SAFETY_LIMIT} results`;
  }
  return `${input.loadedCount} result${input.loadedCount === 1 ? "" : "s"}`;
}

function getSearchResultDisplayLabel(result: ReaderSearchResult, bookTitle: string | null | undefined): string {
  const fallback = getSearchResultFallbackLabel(result);
  const raw = typeof result.sectionLabel === "string" ? result.sectionLabel.trim() : "";
  if (!raw) return fallback;

  const stripped = stripBookTitleSuffix(raw, bookTitle);
  if (!stripped) return fallback;
  if (bookTitle && normalizeLabelForCompare(stripped) === normalizeLabelForCompare(bookTitle)) return fallback;
  return stripped;
}

function getSearchResultFallbackLabel(result: ReaderSearchResult): string {
  if (typeof result.linearIndex === "number" && result.linearIndex > 0) return `Chapter ${result.linearIndex}`;
  if (typeof result.sectionIndex === "number") return `Section ${result.sectionIndex + 1}`;
  return "Section";
}

function stripBookTitleSuffix(label: string, bookTitle: string | null | undefined): string {
  const title = typeof bookTitle === "string" ? bookTitle.trim() : "";
  if (!title) return label;
  const normalizedTitle = normalizeLabelForCompare(title);
  const separators = [",", " - ", " – ", " — ", ":", "|"];

  for (const separator of separators) {
    const idx = label.lastIndexOf(separator);
    if (idx <= 0) continue;
    const suffix = label.slice(idx + separator.length).trim();
    if (normalizeLabelForCompare(suffix) === normalizedTitle) {
      return label.slice(0, idx).trim();
    }
  }

  return label;
}

function normalizeLabelForCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function renderHighlightedExcerpt(excerpt: string, query: string) {
  const q = query.trim();
  if (!q) return excerpt;

  const lowerExcerpt = excerpt.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const parts: Array<string | JSX.Element> = [];
  let cursor = 0;
  let matchIndex = lowerExcerpt.indexOf(lowerQuery);
  let key = 0;

  while (matchIndex >= 0) {
    if (matchIndex > cursor) parts.push(excerpt.slice(cursor, matchIndex));
    const end = matchIndex + q.length;
    parts.push(
      <mark key={key} className="spBookSearchMatch">
        {excerpt.slice(matchIndex, end)}
      </mark>,
    );
    key += 1;
    cursor = end;
    matchIndex = lowerExcerpt.indexOf(lowerQuery, cursor);
  }

  if (cursor < excerpt.length) parts.push(excerpt.slice(cursor));
  return parts.length > 0 ? parts : excerpt;
}
