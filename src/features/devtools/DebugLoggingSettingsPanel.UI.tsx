import { useState } from "react";
import {
  DEBUG_LOG_CATEGORIES,
  DEBUG_IMPORT_VERBOSE_STORAGE_KEY,
  getEnabledDebugCategories,
  setEnabledDebugCategories,
  type DebugLogCategory,
} from "../../lib/debug/DebugLogger.Diagnostics";

const CATEGORY_LABELS: Record<DebugLogCategory, string> = {
  imports: "Import and marginalia matching",
  "staged-selection": "Staged selection lifecycle",
  reader: "Reader lifecycle",
};

export function DebugLoggingSettingsPanel() {
  const [enabledCategories, setEnabledCategories] = useState<DebugLogCategory[]>(getEnabledDebugCategories);
  const [importVerbose, setImportVerbose] = useState(() => readLocalStorageFlag(DEBUG_IMPORT_VERBOSE_STORAGE_KEY));

  function updateCategory(category: DebugLogCategory, enabled: boolean) {
    const next = enabled
      ? DEBUG_LOG_CATEGORIES.filter((candidate) => candidate === category || enabledCategories.includes(candidate))
      : enabledCategories.filter((candidate) => candidate !== category);
    setEnabledCategories(next);
    setEnabledDebugCategories(next);
    if (category === "imports" && !enabled) updateImportVerbose(false);
  }

  function enableAll() {
    const next = [...DEBUG_LOG_CATEGORIES];
    setEnabledCategories(next);
    setEnabledDebugCategories(next);
  }

  function disableAll() {
    setEnabledCategories([]);
    setEnabledDebugCategories([]);
    updateImportVerbose(false);
  }

  function updateImportVerbose(enabled: boolean) {
    setImportVerbose(enabled);
    writeLocalStorageFlag(DEBUG_IMPORT_VERBOSE_STORAGE_KEY, enabled);
  }

  const importsEnabled = enabledCategories.includes("imports");

  return (
    <section className="panel settingsCard settingsDiagnostics">
      <div className="settingsSectionHeader">
        <h2 className="panelTitle">Debug logging</h2>
        <div className="settingsActions">
          <button type="button" className="button buttonCompact" onClick={enableAll}>
            Enable all
          </button>
          <button type="button" className="button buttonCompact" onClick={disableAll}>
            Disable all
          </button>
        </div>
      </div>
      <div className="settingsControlBlock">
        <p className="muted">Writes selected development diagnostics to this browser's console only.</p>
        {DEBUG_LOG_CATEGORIES.map((category) => (
          <div className="debugLoggingCategoryGroup" key={category}>
            <label className="settingsCheckboxRow">
              <input
                type="checkbox"
                checked={enabledCategories.includes(category)}
                onChange={(event) => updateCategory(category, event.currentTarget.checked)}
              />
              <span>{CATEGORY_LABELS[category]}</span>
            </label>
            {category === "imports" && importsEnabled ? (
              <label className="settingsCheckboxRow debugLoggingSuboption">
                <input
                  type="checkbox"
                  checked={importVerbose}
                  onChange={(event) => updateImportVerbose(event.currentTarget.checked)}
                />
                <span className="debugLoggingSuboptionText">
                  <span>Verbose import search logging</span>
                  <span className="muted">Includes text and query previews. Use only while debugging matching.</span>
                </span>
              </label>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function readLocalStorageFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeLocalStorageFlag(key: string, enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable browser storage.
  }
}
