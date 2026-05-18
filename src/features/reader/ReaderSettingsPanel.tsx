import type { ReaderSettings } from "../../storage/readerSettings";
import { FONT_SIZE_MAX, FONT_SIZE_MIN, normalizeReaderSettings, resetReaderSettings } from "../../storage/readerSettings";

export function ReaderSettingsPanel({
  settings,
  onChange,
}: {
  settings: ReaderSettings;
  onChange: (next: ReaderSettings) => void;
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

