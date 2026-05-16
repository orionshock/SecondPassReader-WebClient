import { useMemo, useState } from "react";
import { ApiError, SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { PaginatedResponse, LibraryBook } from "../../schemas/library";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { getConnectionStatus } from "../connection/connectionStatus";
import { BookList } from "./BookList";

type Props = {
  profile: ConnectionProfile | null;
};

type Ordering = "-updated_at" | "title" | "-created_at" | "-published_date";

export function LibraryLandingPage({ profile }: Props) {
  const status = useMemo(() => getConnectionStatus(profile), [profile]);

  const [q, setQ] = useState("");
  const [hasFiles, setHasFiles] = useState(true);
  const [ordering, setOrdering] = useState<Ordering>("-updated_at");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<LibraryBook> | null>(null);

  async function loadBooks(targetPage = page) {
    if (!profile) return;
    if (!profile.apiBaseUrl || !profile.accessToken) return;

    setBusy(true);
    setError(null);
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: profile.serverBaseUrl });
      const result = await api.listBooks({
        apiBaseUrl: profile.apiBaseUrl,
        accessToken: profile.accessToken,
        tokenType: profile.tokenType ?? "Bearer",
        params: {
          q: q.trim() || undefined,
          hasFiles,
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

  return (
    <section className="panel">
      <h2 className="panelTitle">Library</h2>

      {status === "not_configured" ? <p className="muted">Select a server profile first.</p> : null}
      {status === "configured" ? <p className="muted">Link this profile before loading the library.</p> : null}
      {status === "linked" ? <p className="muted">Verify this profile before loading the library.</p> : null}

      {status === "verified" ? (
        <>
          <div className="libraryControls">
            <label className="field">
              <span className="fieldLabel">Search</span>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="q…" />
            </label>

            <label className="field checkboxField">
              <input
                type="checkbox"
                checked={hasFiles}
                onChange={(e) => setHasFiles(e.target.checked)}
              />
              <span>Only books with files</span>
            </label>

            <label className="field">
              <span className="fieldLabel">Ordering</span>
              <select className="input" value={ordering} onChange={(e) => setOrdering(e.target.value as Ordering)}>
                <option value="-updated_at">Recently updated</option>
                <option value="title">Title</option>
                <option value="-created_at">Created</option>
                <option value="-published_date">Published</option>
              </select>
            </label>

            <label className="field">
              <span className="fieldLabel">Page size</span>
              <select className="input" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>

          <div className="formActions">
            <button className="button buttonPrimary" type="button" onClick={() => void loadBooks(1)} disabled={busy}>
              {busy ? "Loading…" : "Load Library"}
            </button>

            <button
              className="button"
              type="button"
              onClick={() => void loadBooks(Math.max(1, page - 1))}
              disabled={busy || !data?.previous}
            >
              Previous page
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void loadBooks(page + 1)}
              disabled={busy || !data?.next}
            >
              Next page
            </button>
          </div>

          {error ? <p className="errorText">{error}</p> : null}

          {data ? (
            <>
              <div className="muted">
                Showing page {page} · {data.count} total
              </div>
              <BookList books={data.results} />
            </>
          ) : (
            <p className="muted">Load the library to view books.</p>
          )}
        </>
      ) : null}
    </section>
  );
}

