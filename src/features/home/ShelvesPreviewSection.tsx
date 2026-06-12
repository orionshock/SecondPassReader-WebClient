import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@secondpass/client";
import { navigateTo } from "../../app/navigation";
import type { SecondPassClient, Shelf } from "@secondpass/client";

export function ShelvesPreviewSection({ spl }: { spl: SecondPassClient | null }) {
  const canLoad = Boolean(spl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shelves, setShelves] = useState<Shelf[] | null>(null);

  const load = useCallback(async () => {
    if (!spl) return;
    setBusy(true);
    setError(null);
    try {
      const r = await spl.shelves.list();
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
  }, [spl]);

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
