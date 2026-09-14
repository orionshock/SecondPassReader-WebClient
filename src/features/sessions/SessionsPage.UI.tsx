import { useCallback } from "react";
import { ApiError } from "@secondpass/client";
import type { SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { navigateTo, routeToHash } from "../../app/AppNavigation.Router";
import { resolveCoverUrl } from "../library/BookCover.Mapper";
import { InlineMeta, MetaSeparator } from "../../components/Metadata.UI";
import { saveReaderReturnTarget } from "../reader/ReaderReturnTarget.Store";
import { getAuthRecoveryMessage, getPageLoadErrorMessage, isAuthorizationError } from "../../app/AppUserFacingErrors.Mapper";
import { PageLoadErrorNotice } from "../../app/AppPageLoadErrorNotice.UI";
import { useSessionsList } from "./SessionsList.Controller";
import { getSessionDisplayName } from "./SessionDisplayName.Presenter";

function formatIso(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
  } catch {
    return iso;
  }
}

function formatAnnotationCount(n?: number | null): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const count = Math.max(0, Math.floor(n));
  return count === 1 ? "1 annotation" : `${count} annotations`;
}

export function getSessionsLoadErrorMessage(error: unknown, hasBookFilter: boolean): string {
  const authMessage = getAuthRecoveryMessage("access Reading Sessions");
  if (isAuthorizationError(error)) return authMessage;
  if (error instanceof ApiError && error.status === 400 && hasBookFilter) {
    return "That book filter is not valid.";
  }
  if (error instanceof ApiError && error.status === 404 && hasBookFilter) {
    return "That book could not be found or is not accessible.";
  }
  return getPageLoadErrorMessage(error, "Couldn't load Reading Sessions. Reload the page to try again.", authMessage);
}

export function SessionsLoadErrorNotice({ error, hasBookFilter }: { error: unknown; hasBookFilter: boolean }) {
  return (
    <PageLoadErrorNotice
      error={error}
      message={getSessionsLoadErrorMessage(error, hasBookFilter)}
    />
  );
}

export function SessionsNoDataState({ busy, hasError }: { busy: boolean; hasError: boolean }) {
  if (hasError) return null;
  return (
    <div className="muted" style={{ marginTop: 10 }}>
      {busy ? "Loading Reading Sessions..." : "No Reading Sessions yet."}
    </div>
  );
}

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
  const {
    canLoad, bookFilter, effectiveSearchQuery, filter, pageSize, searchDraft,
    busy, error, page, data, contextBook, sessions,
    changeFilter, changePageSize, changeSearchDraft, previousPage, nextPage,
  } = useSessionsList({ spl, bookId, searchQuery });

  const commitSearch = useCallback(() => {
    const next = searchDraft.trim();
    navigateTo({ kind: "sessions", bookId: bookFilter ?? undefined, q: next || undefined });
  }, [bookFilter, searchDraft]);

  return (
    <section className="panel sessionsPage">
      <h1 className="srOnly">Reading Sessions</h1>
      {!canLoad ? <p className="muted">Connect to Second Pass Library to view Reading Sessions.</p> : null}
      {error ? (
        <SessionsLoadErrorNotice error={error} hasBookFilter={Boolean(bookFilter)} />
      ) : null}

      <form
        className="sessionsToolbar"
        onSubmit={(e) => {
          e.preventDefault();
          commitSearch();
        }}
      >
        <div className="sessionsFilters" role="group" aria-label="Reading Session status">
          <button type="button" aria-pressed={filter === "all"} className={`sessionsFilter ${filter === "all" ? "sessionsFilterActive" : ""}`} onClick={() => changeFilter("all")}>
            All
          </button>
          <button type="button" aria-pressed={filter === "active"} className={`sessionsFilter ${filter === "active" ? "sessionsFilterActive" : ""}`} onClick={() => changeFilter("active")}>
            Active
          </button>
          <button type="button" aria-pressed={filter === "closed"} className={`sessionsFilter ${filter === "closed" ? "sessionsFilterActive" : ""}`} onClick={() => changeFilter("closed")}>
            Closed
          </button>
        </div>

        <label className="sessionsSearchField">
          <span className="srOnly">Search Reading Sessions and books</span>
          <input
            className="input sessionsSearchInput"
            value={searchDraft}
            onChange={(e) => changeSearchDraft(e.target.value)}
            placeholder="Search Reading Sessions and books..."
            disabled={!canLoad}
          />
        </label>

        <button type="submit" className="button buttonPrimary buttonCompact" disabled={!canLoad || busy}>
          Search
        </button>

        <label className="toolbarField">
          <span className="srOnly">Page size</span>
          <select className="input inputCompact" value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))} disabled={busy}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </form>

      <div className="sessionsSearchHint muted">
        Searches Reading Session names and notes, plus book titles, authors, and series. Annotations are not searched.
      </div>

      {bookFilter && contextBook ? (
        <div className="sessionsScope">
          <div className="sessionsScopeTitle">Reading Sessions for {contextBook.title}</div>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="libraryMetaRow">
            <div className="muted">
              <InlineMeta items={[`Page ${page}`, `${data.count} Reading Sessions`]} />
            </div>
            <div className="pagerButtons">
              <button type="button" className="button buttonCompact" onClick={() => void previousPage()} disabled={busy || !data.previous}>
                Previous
              </button>
              <button type="button" className="button buttonCompact" onClick={() => void nextPage()} disabled={busy || !data.next}>
                Next
              </button>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="sessionsEmpty">
              <p className="muted">
                {effectiveSearchQuery
                  ? bookFilter
                    ? "No Reading Sessions for this Book match this search."
                    : "No Reading Sessions match this search."
                  : bookFilter && contextBook
                    ? `No Reading Sessions for ${contextBook.title} yet.`
                    : "No Reading Sessions yet."}
              </p>
              {bookFilter && contextBook && !effectiveSearchQuery ? (
                <button
                  type="button"
                  className="button buttonPrimary buttonCompact"
                  onClick={() => {
                    saveReaderReturnTarget(contextBook.id, {
                      kind: "sessions",
                      label: "Reading Sessions",
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
                const sessionBook = "book" in s ? s.book : contextBook;
                const coverSrc = resolveCoverUrl(sessionBook?.coverUrl ?? null, profile);
                const updated = formatIso(s.updatedAt);
                const statusLine = s.status;
                const sessionName = getSessionDisplayName(s.name, s.id);
                const annoText = formatAnnotationCount(s.annotationCount);

                return (
                  <button
                    key={s.id}
                    type="button"
                    className="sessionsRow"
                    onClick={() => navigateTo({ kind: "session", sessionId: s.id })}
                    aria-label={`Open ${sessionName}`}
                    title={sessionName}
                  >
                    <div className="sessionsCover">
                      {coverSrc ? (
                        <img className="sessionsCoverImg" src={coverSrc} alt={`${sessionBook?.title ?? "Book"} cover`} loading="lazy" />
                      ) : (
                        <div className="bookCoverPlaceholderText">No cover</div>
                      )}
                    </div>

                    <div className="sessionsMain">
                      <div className="sessionsTitleLine">
                        <span className="bookTitle">{sessionBook?.title ?? "Book"}</span>
                      </div>
                      <div className="sessionsMeta muted">
                        <span className="mono">{sessionName}</span>
                      </div>
                      <div className="sessionsMeta muted">
                        {statusLine ? <span>{statusLine}</span> : null}
                        {statusLine && annoText ? <MetaSeparator /> : null}
                        {annoText ? <span>{annoText}</span> : null}
                        {(statusLine || annoText) && updated ? <MetaSeparator /> : null}
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
              <InlineMeta items={[`Page ${page}`, `${data.count} Reading Sessions`]} />
            </div>
            <div className="pagerButtons">
              <button type="button" className="button buttonCompact" onClick={() => void previousPage()} disabled={busy || !data.previous}>
                Previous
              </button>
              <button type="button" className="button buttonCompact" onClick={() => void nextPage()} disabled={busy || !data.next}>
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <SessionsNoDataState busy={busy} hasError={Boolean(error)} />
      )}
    </section>
  );
}
