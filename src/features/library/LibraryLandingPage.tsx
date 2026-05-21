import { useEffect, useMemo, useState } from "react";
import { ApiError, SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { PaginatedResponse, LibraryBook } from "../../schemas/library";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { navigateTo } from "../../app/navigation";
import { getConnectionStatus } from "../connection/connectionStatus";
import { BookDetailModal } from "./BookDetailModal";
import { BookList } from "./BookList";

type Props = {
  profile: ConnectionProfile | null;
  initialQuery?: string;
  modalBookId?: string | null;
  onCloseModal?: () => void;
  onQueryChange?: (q: string) => void;
  onQueryCommit?: (q: string) => void;
};

type Ordering = "-updated_at" | "title" | "-created_at" | "-published_date";

export function LibraryLandingPage({
  profile,
  initialQuery,
  modalBookId,
  onCloseModal,
  onQueryChange,
  onQueryCommit,
}: Props) {
  const status = useMemo(() => getConnectionStatus(profile), [profile]);

  const [q, setQ] = useState(initialQuery ?? "");
  const [ordering, setOrdering] = useState<Ordering>("title");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  // Only used for library requests, so typing doesn't auto-search on every keystroke.
  const [committedQuery, setCommittedQuery] = useState((initialQuery ?? "").trim());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<LibraryBook> | null>(null);

  useEffect(() => {
    const next = initialQuery ?? "";
    setQ((prev) => (prev === next ? prev : next));
    // If we navigated to a URL with a query (e.g. Home search, or browser back), auto-load it once.
    const trimmed = next.trim();
    if (trimmed && trimmed !== committedQuery) {
      setCommittedQuery(trimmed);
      setData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  async function loadBooks(targetPage = page, opts?: { queryOverride?: string }) {
    if (!profile) return;
    if (!profile.apiBaseUrl || !profile.accessToken) return;

    const effectiveQuery = (opts?.queryOverride ?? committedQuery).trim();
    setBusy(true);
    setError(null);
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: profile.serverBaseUrl });
      const result = await api.listBooks({
        apiBaseUrl: profile.apiBaseUrl,
        accessToken: profile.accessToken,
        tokenType: profile.tokenType ?? "Bearer",
        params: {
          q: effectiveQuery || undefined,
          ordering,
          page: targetPage,
          pageSize,
        },
      });
      setData(result);
      setPage(targetPage);
    } catch (e) {
      if (e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")) {
        setError(
          "Your reader client is linked, but this token is not allowed to access the library. It may be revoked, lack permissions, or the server may not support reader-token library access yet.",
        );
      } else {
        setError(e instanceof Error ? e.message : "Failed to load library.");
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (status !== "verified") return;
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (data) return;
    void loadBooks(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, profile?.apiBaseUrl, profile?.accessToken, ordering, pageSize, committedQuery, data]);

  async function handleOpenReader(book: LibraryBook) {
    // Route is canonical: App's reader route effect owns opening/restoring the book.
    navigateTo({ kind: "reader", bookId: String(book.id) });
  }

  function handleViewBook(book: LibraryBook) {
    const nextQ = q.trim();
    navigateTo(
      nextQ ? { kind: "libraryBook", bookId: String(book.id), q: nextQ } : { kind: "libraryBook", bookId: String(book.id) },
    );
  }

  const modalInitialBook =
    modalBookId && data?.results ? data.results.find((b) => String(b.id) === String(modalBookId)) ?? null : null;

  return (
    <section className="panel">
      <h2 className="panelTitle">Search the Library</h2>

      {status === "not_configured" ? <p className="muted">Select a server profile first.</p> : null}
      {status === "configured" ? <p className="muted">Link this profile before loading the library.</p> : null}
      {status === "linked" ? <p className="muted">Verify this profile before loading the library.</p> : null}

      {status === "verified" ? (
        <>
          <div className="librarySearchSection">
            <div className="libraryToolbar">
              <label className="toolbarField toolbarSearch">
                <span className="srOnly">Search</span>
                <input
                  className="input inputCompact"
                  value={q}
                  onChange={(e) => {
                    const next = e.target.value;
                    setQ(next);
                    onQueryChange?.(next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const next = q.trim();
                    onQueryCommit?.(q);
                    setCommittedQuery(next);
                    setData(null);
                    void loadBooks(1, { queryOverride: next });
                  }}
                  placeholder="Search..."
                />
              </label>

              <label className="toolbarField">
                <span className="srOnly">Ordering</span>
                <select
                  className="input inputCompact"
                  value={ordering}
                  onChange={(e) => {
                    setOrdering(e.target.value as Ordering);
                    setData(null);
                  }}
                >
                  <option value="-updated_at">Recently updated</option>
                  <option value="title">Title</option>
                  <option value="-created_at">Created</option>
                  <option value="-published_date">Published</option>
                </select>
              </label>

              <label className="toolbarField">
                <span className="srOnly">Page size</span>
                <select
                  className="input inputCompact"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setData(null);
                  }}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>

              <button
                className="button buttonPrimary"
                type="button"
                onClick={() => {
                  const next = q.trim();
                  onQueryCommit?.(q);
                  setCommittedQuery(next);
                  setData(null);
                  void loadBooks(1, { queryOverride: next });
                }}
                disabled={busy}
              >
                {busy ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          {error ? <p className="errorText">{error}</p> : null}

          {data ? (
            <>
              {(() => {
                const totalPages = Math.max(1, Math.ceil((data.count ?? 0) / pageSize));
                return (
                  <div className="libraryMetaRow">
                    <div className="muted">
                      Page {page} of {totalPages} · {data.count} books
                    </div>
                    <div className="pagerButtons">
                      <button
                        className="button buttonCompact"
                        type="button"
                        onClick={() => void loadBooks(Math.max(1, page - 1))}
                        disabled={busy || !data.previous}
                      >
                        Previous
                      </button>
                      <button
                        className="button buttonCompact"
                        type="button"
                        onClick={() => void loadBooks(page + 1)}
                        disabled={busy || !data.next}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                );
              })()}

              <BookList
                books={data.results}
                serverBaseUrl={profile?.serverBaseUrl}
                selectedBookId={modalBookId ? String(modalBookId) : null}
                onViewBook={handleViewBook}
              />

              {(() => {
                const totalPages = Math.max(1, Math.ceil((data.count ?? 0) / pageSize));
                return (
                  <div className="libraryMetaRow libraryMetaRowBottom">
                    <div className="muted">
                      Page {page} of {totalPages} · {data.count} books
                    </div>
                    <div className="pagerButtons">
                      <button
                        className="button buttonCompact"
                        type="button"
                        onClick={() => void loadBooks(Math.max(1, page - 1))}
                        disabled={busy || !data.previous}
                      >
                        Previous
                      </button>
                      <button
                        className="button buttonCompact"
                        type="button"
                        onClick={() => void loadBooks(page + 1)}
                        disabled={busy || !data.next}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="muted" style={{ marginTop: 10 }}>
              {busy ? "Loading…" : "No results yet."}
            </div>
          )}

          {modalBookId ? (
            <BookDetailModal
              profile={profile}
              bookId={String(modalBookId)}
              initialBook={modalInitialBook}
              onClose={() => onCloseModal?.()}
              onOpenReader={handleOpenReader}
              launchMessage={null}
              downloadState={{ phase: "idle" }}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
