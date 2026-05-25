import { useCallback, useEffect, useState } from "react";
import { SecondPassApiClient } from "@secondpass/client";
import type { ReadingRecentSessionsResponse } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { navigateTo } from "../../app/navigation";
import { resolveCoverUrl } from "./coverUtils";

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
}: {
  profile: ConnectionProfile | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReadingRecentSessionsResponse | null>(null);
  const [brokenCoverIds, setBrokenCoverIds] = useState<Record<string, true>>({});

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

  function handleResume(bookId: string | number) {
    const bookKey = String(bookId);
    setError(null);
    try {
      navigateTo({ kind: "reader", bookId: bookKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resume book.");
    }
  }

  return (
    <div className="recentReadingSection">
      <div className="panelHeaderRow" style={{ marginBottom: 8 }}>
        <div className="panelTitle" style={{ margin: 0 }}>
          Continue reading
        </div>
        <div className="muted">
          {busy ? `Loading${"\u2026"}` : data && data.count > 1 ? `${data.count} recent` : null}
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
            const coverSrc = brokenCoverIds[id] ? undefined : resolveCoverUrl(item.book.cover_url, profile);
            const rawProgression = item.session?.progression;
            const progression =
              typeof rawProgression === "number" && Number.isFinite(rawProgression) ? Math.min(1, Math.max(0, rawProgression)) : null;
            const progressionPercent = progression != null ? Math.round(progression * 100) : null;
            const sessionName = typeof item.session?.name === "string" ? item.session.name.trim() : "";
            const ariaLabel = `Resume ${item.book.title}${progressionPercent != null ? `, ${progressionPercent}% complete` : ""}`;
            return (
              <button
                key={item.session.id}
                type="button"
                className="recentBookCard"
                onClick={() => handleResume(item.book.id)}
                disabled={!canLoad}
                aria-label={ariaLabel}
                title={sessionName ? `${ariaLabel}\n${sessionName}` : ariaLabel}
              >
                <div className="recentCoverWrap">
                  {coverSrc ? (
                    <img
                      className="recentCoverImg"
                      src={coverSrc}
                      alt={`${item.book.title} cover`}
                      loading="lazy"
                      onError={() => setBrokenCoverIds((prev) => ({ ...prev, [id]: true }))}
                    />
                  ) : (
                    <div className="recentCoverPlaceholder">No cover</div>
                  )}
                  {progressionPercent != null ? <div className="recentProgressBadge">{progressionPercent}%</div> : null}
                </div>
                <div className="recentBookTitle" title={item.book.title}>
                  {item.book.title}
                </div>
                <div className="recentBookMeta muted">Last read: {formatLastActivity(item.last_activity_at)}</div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
