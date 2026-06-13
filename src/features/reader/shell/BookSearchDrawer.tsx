import { useEffect, useRef, useState } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon";
import type { ReaderSearchOptions, ReaderSearchResult } from "../domain/types";

type SearchStatus = "idle" | "searching" | "ready" | "error";

export function BookSearchDrawer({
  open,
  ready,
  searchBook,
  onClose,
  onJump,
}: {
  open: boolean;
  ready: boolean;
  searchBook: ((query: string, options?: ReaderSearchOptions) => Promise<ReaderSearchResult[]>) | null;
  onClose: () => void;
  onJump: (result: ReaderSearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [results, setResults] = useState<ReaderSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

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

    void (async () => {
      try {
        const next = await searchBook(trimmed, { maxResults: 100, maxSeqEle: 6, signal: controller.signal });
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

  const resultCountText = status === "ready" ? `${results.length} result${results.length === 1 ? "" : "s"}` : null;

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
          {results.map((result) => (
            <article key={result.id} className="spBookSearchResult">
              <button type="button" className="spBookSearchResultButton" onClick={() => onJump(result)}>
                <span className="spBookSearchResultLabel">{result.sectionLabel ?? "Section"}</span>
                <span className="spBookSearchExcerpt">{result.excerpt}</span>
              </button>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
