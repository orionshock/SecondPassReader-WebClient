import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, SecondPassApiClient } from "@secondpass/client";
import { navigateTo } from "../../app/navigation";
import type { Shelf } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";

export function ShelvesPreviewSection({ profile }: { profile: ConnectionProfile | null }) {
  const canLoad = Boolean(profile?.apiBaseUrl && profile?.accessToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shelves, setShelves] = useState<Shelf[] | null>(null);

  const load = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: profile.serverBaseUrl });
      const r = await api.listShelves({
        apiBaseUrl: profile.apiBaseUrl,
        accessToken: profile.accessToken,
        tokenType: profile.tokenType ?? "Bearer",
      });
      setShelves(r.results ?? []);
    } catch (e) {
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "Could not load shelves."
          : e instanceof Error
            ? e.message
            : "Failed to load shelves.";
      setError(message);
      setShelves(null);
    } finally {
      setBusy(false);
    }
  }, [profile]);

  useEffect(() => {
    setShelves(null);
    setError(null);
    setBusy(false);
    if (!canLoad) return;
    void load();
  }, [canLoad, load]);

  const previewShelves = useMemo(() => (shelves ?? []).slice(0, 6), [shelves]);

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
        <div className="muted">
          {error}{" "}
          <button type="button" className="button buttonCompact" onClick={() => void load()} disabled={!canLoad || busy}>
            Retry
          </button>
        </div>
      ) : null}

      {canLoad && !busy && !error && shelves && shelves.length === 0 ? <div className="muted">No shelves yet.</div> : null}

      {previewShelves.length ? (
        <div className="shelfPreviewList">
          {previewShelves.map((s) => (
            <button
              key={s.id}
              type="button"
              className="shelfPreviewChip"
              onClick={() => navigateTo({ kind: "shelf", shelfId: s.id })}
              title={s.description ?? undefined}
            >
              <span>{s.name}</span>
              <span className="muted">({s.item_count ?? 0})</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
