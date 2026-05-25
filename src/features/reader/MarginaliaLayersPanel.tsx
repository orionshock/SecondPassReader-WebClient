import type { PreviousSessionLayer } from "./usePreviousSessionLayers";

export function MarginaliaLayersPanel({
  loading,
  error,
  layers,
  onToggle,
  onLoadMore,
}: {
  loading: boolean;
  error: string | null;
  layers: PreviousSessionLayer[];
  onToggle: (sessionId: string) => void;
  onLoadMore: (sessionId: string) => void;
}) {
  return (
    <div className="marginaliaLayersPanel">
      <div className="marginaliaLayersTitle">Marginalia layers</div>

      {loading ? <div className="muted">Loading previous sessions...</div> : null}
      {error ? <div className="errorText">{error}</div> : null}

      {!loading && !error && layers.length === 0 ? <div className="muted">No previous sessions for this book.</div> : null}

      {layers.length ? (
        <div className="marginaliaLayersList">
          {layers.map((layer) => {
            const s = layer.session;
            const sid = String(s.id);
            const label = (s.name ?? "").trim() || sid;
            return (
              <div key={sid} className="marginaliaLayerRow">
                <label className="marginaliaLayerLabel">
                  <input
                    type="checkbox"
                    checked={layer.checked}
                    onChange={() => onToggle(sid)}
                    aria-label={`Toggle marginalia layer ${label}`}
                  />
                  <span className={s.name ? "" : "mono muted"}>{label}</span>
                </label>
                <span className="muted marginaliaLayerMeta">
                  {s.status}
                  {"\u00B7"} {s.annotation_count ?? 0} annotations
                </span>
                {layer.checked ? (
                  <div className="marginaliaLayerMetaRow">
                    {layer.loading ? <span className="muted">Loading…</span> : null}
                    {layer.error ? <span className="errorText">{layer.error}</span> : null}
                    {layer.hasMore ? (
                      <button
                        type="button"
                        className="button buttonCompact"
                        onClick={() => onLoadMore(sid)}
                        disabled={layer.loading}
                      >
                        Load more
                      </button>
                    ) : null}
                    {layer.totalCount !== undefined && layer.loadedCount < layer.totalCount ? (
                      <span className="muted">
                        Showing {layer.loadedCount} of {layer.totalCount}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

