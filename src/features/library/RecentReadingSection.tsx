import { useCallback, useEffect, useState } from "react";
import { SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { LibraryBook } from "../../schemas/library";
import type { ReadingRecentSessionsResponse } from "../../schemas/readingSession";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { navigateTo } from "../../app/navigation";

function formatLastActivity(isoUtc: string): string {
  try {
    const d = new Date(isoUtc);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : isoUtc;
  } catch {
    return isoUtc;
  }
}

export function RecentReadingSection({
  profile,
  onOpenReader,
}: {
  profile: ConnectionProfile | null;
  onOpenReader: (book: LibraryBook) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReadingRecentSessionsResponse | null>(null);
  const [resumeBusyId, setResumeBusyId] = useState<string | null>(null);

  const canLoad = Boolean(profile?.apiBaseUrl && profile?.accessToken);

  const loadRecent = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: profile.serverBaseUrl });
      const r = await api.listRecentReadingSessions({
        apiBaseUrl: profile.apiBaseUrl,
        accessToken: profile.accessToken,
        tokenType: profile.tokenType ?? "Bearer",
        limit: 10,
      });
      setData(r);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load recent reading.");
    } finally {
      setBusy(false);
    }
  }, [profile]);

  useEffect(() => {
    setData(null);
    setError(null);
    setBusy(false);
    if (!canLoad) return;
    void loadRecent();
  }, [canLoad, loadRecent]);

  async function handleResume(bookId: string | number) {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    const bookKey = String(bookId);
    if (resumeBusyId) return;
    setResumeBusyId(bookKey);
    setError(null);
    try {
      navigateTo({ kind: "reader", bookId: bookKey });
      const api = new SecondPassApiClient({ serverBaseUrl: profile.serverBaseUrl });
      const full = await api.getBook({
        apiBaseUrl: profile.apiBaseUrl,
        accessToken: profile.accessToken,
        tokenType: profile.tokenType ?? "Bearer",
        bookId: bookKey,
      });
      await onOpenReader(full);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resume book.");
    } finally {
      setResumeBusyId(null);
    }
  }

  return (
    <div className="recentReadingSection">
      <div className="panelHeaderRow" style={{ marginBottom: 8 }}>
        <div className="panelTitle" style={{ margin: 0 }}>
          Continue reading
        </div>
        <div className="muted">
          {busy ? "Loading…" : data ? `showing ${data.count}` : null}
          {error ? (
            <>
              {" "}
              <button type="button" className="button buttonCompact" onClick={() => void loadRecent()} disabled={!canLoad || busy}>
                Retry
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <div className="errorText">{error}</div> : null}

      {!busy && !error && (!data?.results || data.results.length === 0) ? <div className="muted">No recent reading yet.</div> : null}

      {data?.results?.length ? (
        <div className="recentCarousel" role="region" aria-label="Recent reading">
          {data.results.map((item) => {
            const id = String(item.book.id);
            const resumeBusy = resumeBusyId === id;
            return (
              <div key={item.session.id} className="recentBookCard">
                <div className="recentCover">
                  {item.book.cover_url ? (
                    <img className="recentCoverImg" src={item.book.cover_url} alt="" loading="lazy" />
                  ) : (
                    <div className="recentCoverPlaceholder">No cover</div>
                  )}
                </div>
                <div className="recentBookTitle" title={item.book.title}>
                  {item.book.title}
                </div>
                <div className="recentBookMeta muted">Last activity: {formatLastActivity(item.last_activity_at)}</div>
                <button
                  type="button"
                  className="button buttonCompact recentResumeButton"
                  onClick={() => void handleResume(item.book.id)}
                  disabled={!canLoad || resumeBusy}
                >
                  {resumeBusy ? "Resuming…" : "Resume"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
