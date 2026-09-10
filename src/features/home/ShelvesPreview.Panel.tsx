import { useCallback, useEffect, useState } from "react";
import { navigateTo, routeToHash } from "../../app/AppNavigation.Router";
import type { SecondPassClient, Shelf } from "@secondpass/client";
import { HomeShelfCard } from "./HomeShelf.Card";
import { getAuthRecoveryMessage, getPageLoadErrorMessage } from "../../app/AppUserFacingErrors.Mapper";
import { PageLoadErrorNotice } from "../../app/AppPageLoadError.Notice";

export function ShelvesPreviewLoadFailure({
  error,
  disabled,
  onRetry,
}: {
  error: unknown;
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <PageLoadErrorNotice
      error={error}
      message={getPageLoadErrorMessage(
        error,
        "Could not load shelves.",
        getAuthRecoveryMessage("load shelves"),
      )}
      onRetry={onRetry}
      retryDisabled={disabled}
      className="muted"
    />
  );
}

export function ShelvesPreviewSection({
  spl,
  serverBaseUrl,
  offlineNamespaceKey = null,
}: {
  spl: SecondPassClient | null;
  serverBaseUrl?: string | null;
  offlineNamespaceKey?: string | null;
}) {
  const canLoad = Boolean(spl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [shelves, setShelves] = useState<Shelf[] | null>(null);

  const load = useCallback(async () => {
    if (!spl) return;
    setBusy(true);
    setError(null);
    try {
      const r = await spl.shelves.list({ pageSize: 6, includePreviewBooks: true });
      const results = r.results ?? [];
      setShelves(results);
      if (offlineNamespaceKey && Array.isArray(r.results)) {
        void import("./offline/OfflineHomeCache.Actions")
          .then((module) => module.cacheOfflineHomeShelves({ namespaceKey: offlineNamespaceKey, items: results }))
          .catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Could not load shelves."));
      setShelves(null);
    } finally {
      setBusy(false);
    }
  }, [offlineNamespaceKey, spl]);

  useEffect(() => {
    setShelves(null);
    setError(null);
    setBusy(false);
    if (!canLoad) return;
    void load();
  }, [canLoad, load]);

  return (
    <div className="shelfPreviewSection">
      <div className="panelHeaderRow" style={{ marginBottom: 8 }}>
        <div className="panelTitle" style={{ margin: 0 }}>
          Shelves
        </div>
        <button type="button" className="button buttonCompact" onClick={() => navigateTo({ kind: "shelves" })}>
          Open
        </button>
      </div>

      {!canLoad ? <div className="muted">Select a verified profile first.</div> : null}
      {busy ? <div className="muted">{`Loading${"\u2026"}`}</div> : null}
      {error ? (
        <ShelvesPreviewLoadFailure
          error={error}
          onRetry={() => void load()}
          disabled={!canLoad || busy}
        />
      ) : null}

      {canLoad && !busy && !error && shelves && shelves.length === 0 ? <div className="muted">No shelves yet.</div> : null}

      {shelves?.length ? (
        <div className="homeShelfGrid">
          {shelves.map((shelf) => (
            <HomeShelfCard
              key={shelf.id}
              shelf={shelf}
              baseUrl={serverBaseUrl}
              href={routeToHash({ kind: "shelf", shelfId: String(shelf.id) })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
