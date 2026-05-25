import type { ReaderSettings } from "../../storage/readerSettings";
import { FONT_SIZE_MAX, FONT_SIZE_MIN, normalizeReaderSettings, resetReaderSettings } from "../../storage/readerSettings";
import type { PreviousSessionLayer } from "./usePreviousSessionLayers";

export function ReaderSettingsPanel({
  settings,
  onChange,
  marginaliaLayers,
}: {
  settings: ReaderSettings;
  onChange: (next: ReaderSettings) => void;
  marginaliaLayers?: {
    loading: boolean;
    error: string | null;
    layers: PreviousSessionLayer[];
    onToggle: (sessionId: string) => void;
    onLoadMore: (sessionId: string) => void;
  };
}) {
  const step = 5;

  return (
    <div className="readerSettingsPanel">
      <div className="readerSettingsRow">
        <span className="muted">Font size</span>
        <div className="readerSettingsControls">
          <button
            type="button"
            className="button buttonCompact"
            onClick={() => onChange(normalizeReaderSettings({ ...settings, fontSizePercent: settings.fontSizePercent - step }))}
            disabled={settings.fontSizePercent <= FONT_SIZE_MIN}
            aria-label="Decrease font size"
            title="Decrease font size"
          >
            -
          </button>
          <span className="mono">{settings.fontSizePercent}%</span>
          <button
            type="button"
            className="button buttonCompact"
            onClick={() => onChange(normalizeReaderSettings({ ...settings, fontSizePercent: settings.fontSizePercent + step }))}
            disabled={settings.fontSizePercent >= FONT_SIZE_MAX}
            aria-label="Increase font size"
            title="Increase font size"
          >
            +
          </button>
        </div>
      </div>

      <div className="readerSettingsRow">
        <label className="readerSettingsLabel">
          <span className="muted">Line height</span>
          <select
            className="input inputCompact"
            value={settings.lineHeight}
            onChange={(e) =>
              onChange(normalizeReaderSettings({ ...settings, lineHeight: e.target.value as ReaderSettings["lineHeight"] }))
            }
          >
            <option value="compact">Compact</option>
            <option value="normal">Normal</option>
            <option value="relaxed">Relaxed</option>
            <option value="loose">Loose</option>
          </select>
        </label>
      </div>

      <div className="readerSettingsRow">
        <label className="readerSettingsLabel">
          <span className="muted">Font</span>
          <select
            className="input inputCompact"
            value={settings.fontFamily}
            onChange={(e) =>
              onChange(normalizeReaderSettings({ ...settings, fontFamily: e.target.value as ReaderSettings["fontFamily"] }))
            }
          >
            <option value="publisher">Publisher</option>
            <option value="serif">Serif</option>
            <option value="sans">Sans</option>
          </select>
        </label>
      </div>

      <div className="readerSettingsRow">
        <label className="readerSettingsLabel">
          <span className="muted">Page margin</span>
          <select
            className="input inputCompact"
            value={settings.pageMargin}
            onChange={(e) =>
              onChange(normalizeReaderSettings({ ...settings, pageMargin: e.target.value as ReaderSettings["pageMargin"] }))
            }
          >
            <option value="compact">Compact</option>
            <option value="normal">Normal</option>
            <option value="wide">Wide</option>
          </select>
        </label>
      </div>

      <div className="readerSettingsRow">
        <label className="readerSettingsLabel">
          <span className="muted">Theme</span>
          <select
            className="input inputCompact"
            value={settings.theme}
            onChange={(e) => onChange(normalizeReaderSettings({ ...settings, theme: e.target.value as ReaderSettings["theme"] }))}
          >
            <option value="light">Light</option>
            <option value="sepia">Sepia</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <div className="readerSettingsRow">
        <label className="readerSettingsLabel">
          <span className="muted">Reader width</span>
          <select
            className="input inputCompact"
            value={settings.readerWidth}
            onChange={(e) =>
              onChange(normalizeReaderSettings({ ...settings, readerWidth: e.target.value as ReaderSettings["readerWidth"] }))
            }
          >
            <option value="narrow">Narrow</option>
            <option value="normal">Normal</option>
            <option value="wide">Wide</option>
          </select>
        </label>
      </div>

      {marginaliaLayers ? (
        <div className="readerSettingsSection">
          <div className="readerSettingsSectionTitle">Marginalia layers</div>
          {marginaliaLayers.loading ? <div className="muted">Loading previous sessions...</div> : null}
          {marginaliaLayers.error ? <div className="errorText">{marginaliaLayers.error}</div> : null}
          {!marginaliaLayers.loading && !marginaliaLayers.error && marginaliaLayers.layers.length === 0 ? (
            <div className="muted">No previous sessions for this book.</div>
          ) : null}
          {marginaliaLayers.layers.length ? (
            <div className="readerLayersList">
              {marginaliaLayers.layers.map((layer) => {
                const s = layer.session;
                const sid = String(s.id);
                const label = (s.name ?? "").trim() || sid;
                return (
                  <div key={sid} className="readerLayerRow">
                    <label className="readerLayerLabel">
                      <input
                        type="checkbox"
                        checked={layer.checked}
                        onChange={() => marginaliaLayers.onToggle(sid)}
                        aria-label={`Toggle marginalia layer ${label}`}
                      />
                      <span className={s.name ? "" : "mono muted"}>{label}</span>
                    </label>
                    <span className="muted readerLayerMeta">
                      {s.status}
                      {"\u00B7"} {s.annotation_count ?? 0} annotations
                    </span>
                    {layer.checked ? (
                      <div className="readerLayerMetaRow">
                        {layer.loading ? <span className="muted">Loading…</span> : null}
                        {layer.error ? <span className="errorText">{layer.error}</span> : null}
                        {layer.hasMore ? (
                          <button
                            type="button"
                            className="button buttonCompact"
                            onClick={() => marginaliaLayers.onLoadMore(sid)}
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
      ) : null}

      <div className="readerSettingsRow">
        <button
          type="button"
          className="button buttonCompact"
          onClick={() => onChange(resetReaderSettings())}
          aria-label="Reset reader settings"
          title="Reset reader settings"
        >
          Reset reader settings
        </button>
      </div>
    </div>
  );
}
