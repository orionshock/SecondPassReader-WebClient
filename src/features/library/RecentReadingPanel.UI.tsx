import { useCallback, useEffect, useState } from "react";
import type { MarginaliaRecentSessions, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { navigateTo, routeToHash } from "../../app/AppNavigation.Router";
import { saveReaderReturnTarget } from "../reader/ReaderReturnTarget.Store";
import { getAuthRecoveryMessage, getPageLoadErrorMessage } from "../../app/AppUserFacingErrors.Mapper";
import { PageLoadErrorNotice } from "../../app/AppPageLoadErrorNotice.UI";
import { loadRecentReading } from "../reader/ReaderMarginalia.Queries";
import { RecentReadingCarousel } from "./RecentReadingCarousel.UI";

const RECENT_READING_ERROR = "Could not load recent reading.";

export function RecentReadingLoadFailure({
  error,
  disabled,
  onRetry,
}: {
  error: unknown;
  disabled: boolean;
  onRetry: () => void;
}) {
  const message = getPageLoadErrorMessage(
    error,
    RECENT_READING_ERROR,
    getAuthRecoveryMessage("load recent reading"),
  );
  return (
    <PageLoadErrorNotice
      error={error}
      message={message}
      onRetry={onRetry}
      retryDisabled={disabled}
    />
  );
}

export function RecentReadingSection({
  profile,
  spl,
  offlineNamespaceKey = null,
}: {
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  offlineNamespaceKey?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<MarginaliaRecentSessions | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const canLoad = Boolean(spl);

  const loadRecent = useCallback(async () => {
    if (!spl) return;
    setBusy(true);
    setError(null);
    try {
      const r = await loadRecentReading(spl, { includeClosed: showClosed });
      setData(r);
      if (offlineNamespaceKey && Array.isArray(r.results)) {
        void import("../home/offline/OfflineHomeCache.Actions")
          .then((module) => module.cacheOfflineHomeRecent({ namespaceKey: offlineNamespaceKey, items: r.results }))
          .catch(() => undefined);
      }
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e : new Error(RECENT_READING_ERROR));
    } finally {
      setBusy(false);
    }
  }, [offlineNamespaceKey, showClosed, spl]);

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
      saveReaderReturnTarget(bookKey, { kind: "home", label: "Home", route: "#/home" });
      navigateTo({ kind: "reader", bookId: bookKey });
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Failed to resume book."));
    }
  }

  return (
    <div className="recentReadingSection">
      <div className="panelHeaderRow recentReadingHeader">
        <div className="panelTitle" style={{ margin: 0 }}>
          Recent History
        </div>
        <div className="recentReadingHeaderActions">
          <span className="muted">
            {busy ? `Loading${"\u2026"}` : data && data.results.length > 1 ? `${data.results.length} recent` : null}
          </span>
          <button
            type="button"
            className={`button buttonCompact${showClosed ? " buttonPrimary" : ""}`}
            aria-pressed={showClosed}
            disabled={busy}
            onClick={() => setShowClosed((current) => !current)}
          >
            Show closed
          </button>
          <a className="button buttonCompact recentReadingViewAll" href={routeToHash({ kind: "sessions" })}>
            View all
          </a>
        </div>
      </div>

      {error ? (
        <RecentReadingLoadFailure error={error} onRetry={() => void loadRecent()} disabled={!canLoad || busy} />
      ) : null}

      {!busy && !error && (!data?.results || data.results.length === 0) ? <div className="muted">No recent reading yet.</div> : null}

      {data?.results?.length ? (
        <RecentReadingCarousel
          items={data.results}
          profile={profile}
          disabled={!canLoad}
          onResume={handleResume}
        />
      ) : null}
    </div>
  );
}
