import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { ReadingSessionBookSummary, ReadingSessionsListResponse, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { navigateTo, routeToHash } from "../../app/navigation";
import { resolveCoverUrl } from "../library/coverUtils";
import { InlineMeta, MetaSeparator } from "../../components/MetaSeparator";
import { saveReaderReturnTarget } from "../reader/readerReturnTarget";

function formatBookAuthors(book?: ReadingSessionBookSummary | null): string {
  const authors = book?.authors ?? [];
  return (authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
}

function formatBookSeries(book?: ReadingSessionBookSummary | null): string | null {
  const seriesName = book?.series?.name ?? null;
  const idx = book?.series_index;
  if (!seriesName) return null;
  if (idx === null || idx === undefined || idx === "") return seriesName;
  return `${seriesName} #${idx}`;
}

function formatIso(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
  } catch {
    return iso;
  }
}

function formatProgress(p?: number | null): string | null {
  if (typeof p !== "number" || !Number.isFinite(p)) return null;
  const clamped = Math.min(1, Math.max(0, p));
  return `${Math.round(clamped * 100)}%`;
}

function normalizeStatus(status?: string | null, isActive?: boolean | null): "active" | "completed" | "archived" | string {
  if (isActive === true) return "active";
  const raw = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (raw === "active" || raw === "completed" || raw === "archived") return raw;
  if (raw) return raw;
  if (isActive === false) return "completed";
  return "active";
}

function formatAnnotationCount(n?: number | null): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const count = Math.max(0, Math.floor(n));
  return count === 1 ? "1 annotation" : `${count} annotations`;
}

type Filter = "all" | "active" | "closed";

export function SessionsPage({
  profile,
  spl,
  bookId,
  searchQuery = "",
}: {
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  bookId?: string | null;
  searchQuery?: string | null;
}) {
  const canLoad = Boolean(spl);
  const bookFilter = typeof bookId === "string" && bookId.trim() ? bookId.trim() : null;
  const effectiveSearchQuery = typeof searchQuery === "string" ? searchQuery.trim() : "";
  const [filter, setFilter] = useState<Filter>("all");
  const [pageSize, setPageSize] = useState(20);
  const [searchDraft, setSearchDraft] = useState(effectiveSearchQuery);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReadingSessionsListResponse | null>(null);

  const load = useCallback(
    async (targetPage: number) => {
      if (!spl) return;
      setBusy(true);
      setError(null);
      try {
        const r = await spl.reading.sessions.list({
          page: targetPage,
          pageSize,
          bookId: bookFilter ?? undefined,
          isActive: filter === "active" ? true : filter === "closed" ? false : undefined,
          q: effectiveSearchQuery || undefined,
        });
        setData(r);
        setPage(targetPage);
      } catch (e) {
        const message =
          e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
            ? "Could not load sessions. Your device token may be revoked or not allowed to access reading data."
            : e instanceof ApiError && e.status === 400
              ? "That book filter is not valid."
              : e instanceof ApiError && e.status === 404
                ? "That book could not be found or is not accessible."
                : e instanceof Error
                  ? e.message
                  : "Failed to load sessions.";
        setError(message);
        setData(null);
      } finally {
        setBusy(false);
      }
    },
    [bookFilter, effectiveSearchQuery, filter, pageSize, spl],
  );

  useEffect(() => {
    setSearchDraft(effectiveSearchQuery);
  }, [effectiveSearchQuery]);

  useEffect(() => {
    const next = searchDraft.trim();
    if (next === effectiveSearchQuery) return;
    const timer = window.setTimeout(() => {
      navigateTo({ kind: "sessions", bookId: bookFilter ?? undefined, q: next || undefined }, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [bookFilter, effectiveSearchQuery, searchDraft]);

  useEffect(() => {
    setData(null);
    setError(null);
    setBusy(false);
    setPage(1);
    if (!canLoad) return;
    void load(1);
  }, [bookFilter, canLoad, effectiveSearchQuery, filter, load, pageSize]);

  const contextBook = data?.context?.book ?? null;
  const contextBookAuthors = formatBookAuthors(contextBook);
  const contextBookSeries = formatBookSeries(contextBook);
  const sessions = data?.results ?? [];

  return (
    <section className="panel sessionsPage">
      {!canLoad ? <p className="muted">Select a verified profile first.</p> : null}
      {error ? <div className="errorText">{error}</div> : null}

      <div className="sessionsToolbar">
        <div className="sessionsFilters" role="tablist" aria-label="Session filter">
          <button type="button" className={`sessionsFilter ${filter === "all" ? "sessionsFilterActive" : ""}`} onClick={() => setFilter("all")}>
            All
          </button>
          <button type="button" className={`sessionsFilter ${filter === "active" ? "sessionsFilterActive" : ""}`} onClick={() => setFilter("active")}>
            Active
          </button>
          <button type="button" className={`sessionsFilter ${filter === "closed" ? "sessionsFilterActive" : ""}`} onClick={() => setFilter("closed")}>
            Closed
          </button>
        </div>

        <label className="toolbarField">
          <span className="srOnly">Page size</span>
          <select className="input inputCompact" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} disabled={busy}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      <div className="sessionsSearch">
        <label className="sessionsSearchField">
          <span className="srOnly">Search reading sessions and book metadata</span>
          <input
            className="input sessionsSearchInput"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search sessions, books, authors, series…"
            disabled={!canLoad}
          />
        </label>
        <div className="sessionsSearchHint muted">Searches session names and notes, plus visible book titles, authors, and series. Annotation text is not searched.</div>
      </div>

      {bookFilter && contextBook ? (
        <div className="sessionsScope">
          <div className="sessionsScopeTitle">Reading sessions for {contextBook.title}</div>
          {contextBookAuthors || contextBookSeries ? (
            <div className="sessionsScopeMeta muted">
              <InlineMeta items={[contextBookAuthors || null, contextBookSeries]} />
            </div>
          ) : null}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="libraryMetaRow">
            <div className="muted">
              <InlineMeta items={[`Page ${page}`, `${data.count} sessions`]} />
            </div>
            <div className="pagerButtons">
              <button type="button" className="button buttonCompact" onClick={() => void load(Math.max(1, page - 1))} disabled={busy || !data.previous}>
                Previous
              </button>
              <button type="button" className="button buttonCompact" onClick={() => void load(page + 1)} disabled={busy || !data.next}>
                Next
              </button>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="sessionsEmpty">
              <p className="muted">
                {effectiveSearchQuery
                  ? bookFilter
                    ? "No sessions for this book match this search."
                    : "No sessions match this search."
                  : bookFilter && contextBook
                    ? `No reading sessions for ${contextBook.title} yet.`
                    : "No sessions yet."}
              </p>
              {bookFilter && contextBook && !effectiveSearchQuery ? (
                <button
                  type="button"
                  className="button buttonPrimary buttonCompact"
                  onClick={() => {
                    saveReaderReturnTarget(contextBook.id, {
                      kind: "sessions",
                      label: "Reading sessions",
                      route: routeToHash({ kind: "sessions", bookId: bookFilter ?? undefined }),
                      bookId: String(contextBook.id),
                    });
                    navigateTo({ kind: "reader", bookId: String(contextBook.id) });
                  }}
                >
                  Open reader
                </button>
              ) : null}
            </div>
          ) : (
            <div className="sessionsList">
              {sessions.map((s) => {
                const coverSrc = resolveCoverUrl(s.book?.cover_url ?? null, profile);
                const authors = formatBookAuthors(s.book);
                const series = formatBookSeries(s.book);
                const progress = formatProgress(s.progression);
                const updated = formatIso(s.updated_at ?? null);
                const state = normalizeStatus(typeof s.status === "string" ? s.status : null, s.is_active);
                const statusLine = state;
                const sessionName = typeof s.name === "string" ? s.name.trim() : "";
                const annoText = formatAnnotationCount(s.annotation_count);
                const titleBits = [
                  s.book?.title ? s.book.title : "Book",
                  authors ? `<${authors}>` : null,
                  series ? `[${series}]` : null,
                ].filter(Boolean);

                return (
                  <button
                    key={s.id}
                    type="button"
                    className="sessionsRow"
                    onClick={() => navigateTo({ kind: "session", sessionId: s.id })}
                    aria-label={`Manage session ${s.id}`}
                    title={`Session ${s.id}`}
                  >
                    <div className="sessionsCover">
                      {coverSrc ? (
                        <img className="sessionsCoverImg" src={coverSrc} alt={`${s.book?.title ?? "Book"} cover`} loading="lazy" />
                      ) : (
                        <div className="bookCoverPlaceholderText">No cover</div>
                      )}
                    </div>

                    <div className="sessionsMain">
                      <div className="sessionsTitleLine">
                        <span className="bookTitle">{titleBits.join(" ")}</span>
                      </div>
                      <div className="sessionsMeta muted">
                        {sessionName ? <span className="mono">{sessionName}</span> : null}
                        {sessionName ? <MetaSeparator /> : null}
                        <span className="sessionsId">{s.id}</span>
                      </div>
                      <div className="sessionsMeta muted">
                        {statusLine ? <span>{statusLine}</span> : null}
                        {statusLine && progress ? <MetaSeparator /> : null}
                        {progress ? <span>{progress}</span> : null}
                        {(statusLine || progress) && annoText ? <MetaSeparator /> : null}
                        {annoText ? <span>{annoText}</span> : null}
                        {(statusLine || progress || annoText) && updated ? <MetaSeparator /> : null}
                        {updated ? <span>{updated}</span> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="libraryMetaRow libraryMetaRowBottom">
            <div className="muted">
              <InlineMeta items={[`Page ${page}`, `${data.count} sessions`]} />
            </div>
            <div className="pagerButtons">
              <button type="button" className="button buttonCompact" onClick={() => void load(Math.max(1, page - 1))} disabled={busy || !data.previous}>
                Previous
              </button>
              <button type="button" className="button buttonCompact" onClick={() => void load(page + 1)} disabled={busy || !data.next}>
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="muted" style={{ marginTop: 10 }}>
          {busy ? `Loading${"\u2026"}` : "No sessions yet."}
        </div>
      )}
    </section>
  );
}
