import { useMemo, useState } from "react";
import { ApiError, SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { PaginatedResponse, LibraryBook } from "../../schemas/library";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { getConnectionStatus } from "../connection/connectionStatus";
import { BookDetailPanel } from "./BookDetailPanel";
import { BookList } from "./BookList";

type Props = {
  profile: ConnectionProfile | null;
};

type Ordering = "-updated_at" | "title" | "-created_at" | "-published_date";

export function LibraryLandingPage({ profile }: Props) {
  const status = useMemo(() => getConnectionStatus(profile), [profile]);

  const [q, setQ] = useState("");
  const [ordering, setOrdering] = useState<Ordering>("-updated_at");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<LibraryBook> | null>(null);
  const [selectedBook, setSelectedBook] = useState<LibraryBook | null>(null);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<
    | { phase: "idle" }
    | { phase: "fetching" }
    | { phase: "success"; result: { blob: Blob; contentType?: string; contentLength?: number; contentDisposition?: string; filename?: string } }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

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
          ordering,
          page: targetPage,
          pageSize,
        },
      });
      setData(result);
      setPage(targetPage);
      setLaunchMessage(null);
      setDownloadState({ phase: "idle" });
      setSelectedBook((prev) => {
        if (!prev) return null;
        const match = result.results.find((b) => String(b.id) === String(prev.id));
        return match ?? null;
      });
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

  function handleSelectBook(book: LibraryBook) {
    setSelectedBook(book);
    setLaunchMessage(null);
    setDownloadState({ phase: "idle" });
  }

  async function handleOpenReader(book: LibraryBook) {
    setLaunchMessage(null);
    setDownloadState({ phase: "idle" });

    if (!profile?.accessToken) {
      setDownloadState({ phase: "error", message: "Profile is not linked." });
      return;
    }
    if (!book.file?.download_url) {
      setDownloadState({ phase: "error", message: "No EPUB file available for this book." });
      return;
    }

    setDownloadState({ phase: "fetching" });
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: profile.serverBaseUrl });
      const result = await api.downloadBookFile({
        downloadUrl: book.file.download_url,
        accessToken: profile.accessToken,
        tokenType: profile.tokenType ?? "Bearer",
      });
      setDownloadState({ phase: "success", result });
    } catch (e) {
      if (e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")) {
        setDownloadState({
          phase: "error",
          message:
            "Could not download this book file. The token may be revoked or may not have file download permission.",
        });
      } else {
        setDownloadState({ phase: "error", message: e instanceof Error ? e.message : "Download failed." });
      }
      return;
    }

    setLaunchMessage("Reader launch is not implemented yet. Next step: fetch EPUB blob.");
  }

  return (
    <section className="panel">
      <h2 className="panelTitle">Library</h2>

      {status === "not_configured" ? <p className="muted">Select a server profile first.</p> : null}
      {status === "configured" ? <p className="muted">Link this profile before loading the library.</p> : null}
      {status === "linked" ? <p className="muted">Verify this profile before loading the library.</p> : null}

      {status === "verified" ? (
        <>
          <div className="libraryToolbar">
            <label className="toolbarField toolbarSearch">
              <span className="srOnly">Search</span>
              <input
                className="input inputCompact"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
              />
            </label>

            <label className="toolbarField">
              <span className="srOnly">Ordering</span>
              <select
                className="input inputCompact"
                value={ordering}
                onChange={(e) => setOrdering(e.target.value as Ordering)}
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
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>

            <button className="button buttonPrimary" type="button" onClick={() => void loadBooks(1)} disabled={busy}>
              {busy ? "Loading…" : "Load"}
            </button>
          </div>

          {error ? <p className="errorText">{error}</p> : null}

          {data ? (
            <>
              <div className="libraryMetaRow">
                <div className="muted">
                  Showing page {page} · {data.count} total
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

              {selectedBook ? (
                <BookDetailPanel
                  book={selectedBook}
                  launchMessage={launchMessage}
                  onOpenReader={handleOpenReader}
                  downloadState={downloadState}
                />
              ) : (
                <div className="muted">Select a book to view details.</div>
              )}

              <BookList
                books={data.results}
                selectedBookId={selectedBook ? String(selectedBook.id) : null}
                onSelectBook={handleSelectBook}
              />
            </>
          ) : (
            <p className="muted">Load the library to view books.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
