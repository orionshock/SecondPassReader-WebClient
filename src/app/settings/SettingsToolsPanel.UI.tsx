import { useEffect, useState } from "react";
import {
  buildAllZipEntries,
  filterMarginaliaBookGroups,
  formatMarginaliaSessionLabel,
  groupMarginaliaSplitItems,
  type MarginaliaBookGroup,
  parseAndSplitMarginaliaExport,
  type MarginaliaSplitResult,
} from "../../features/settings/MarginaliaSplitExport.Actions";
import { createMarginaliaZipBlob } from "../../features/settings/MarginaliaZipExport.Actions";
import { DebugLoggingSettingsPanel } from "../../features/devtools/DebugLoggingSettingsPanel.UI";
import { SettingsDetailRow } from "./SettingsDetailRow.UI";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

type MarginaliaToolState =
  | { phase: "idle" }
  | { phase: "loaded"; fileName: string; result: MarginaliaSplitResult }
  | { phase: "error"; message: string };

export function SettingsToolsPanel({ active }: { active: boolean }) {
  const [marginaliaState, setMarginaliaState] = useState<MarginaliaToolState>({ phase: "idle" });
  const [hideEmptyMarginaliaSessions, setHideEmptyMarginaliaSessions] = useState(false);

  useEffect(() => {
    if (!active) {
      setMarginaliaState({ phase: "idle" });
      setHideEmptyMarginaliaSessions(false);
    }
  }, [active]);

  async function handleMarginaliaFile(file: File | null) {
    if (!file) {
      setMarginaliaState({ phase: "idle" });
      setHideEmptyMarginaliaSessions(false);
      return;
    }

    try {
      const text = await file.text();
      const result = parseAndSplitMarginaliaExport(text);
      setMarginaliaState({ phase: "loaded", fileName: file.name, result });
    } catch (error) {
      debugWarn("imports", "Marginalia export could not be read", {
        fileName: file.name,
        error,
      });
      setMarginaliaState({
        phase: "error",
        message: error instanceof Error ? error.message : "Couldn't read this export. Check the file and try again.",
      });
    }
  }

  function clearMarginaliaFile() {
    setMarginaliaState({ phase: "idle" });
    setHideEmptyMarginaliaSessions(false);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function downloadMarginaliaSplit(item: MarginaliaSplitResult["items"][number]) {
    downloadBlob(new Blob([`${JSON.stringify(item.exportJson, null, 2)}\n`], { type: "application/json" }), item.filename);
  }

  function downloadMarginaliaBookZip(group: MarginaliaBookGroup) {
    const entries = group.items.map((item) => ({ path: item.filename, item }));
    downloadBlob(createMarginaliaZipBlob(entries), group.zipFilename);
  }

  function downloadAllMarginaliaZip(groups: MarginaliaBookGroup[]) {
    downloadBlob(createMarginaliaZipBlob(buildAllZipEntries(groups)), "secondpass-marginalia-sessions.zip");
  }

  const marginaliaGroups = marginaliaState.phase === "loaded" ? groupMarginaliaSplitItems(marginaliaState.result.items) : [];
  const visibleMarginaliaGroups = filterMarginaliaBookGroups(marginaliaGroups, hideEmptyMarginaliaSessions);
  const hiddenEmptySessionCount =
    marginaliaState.phase === "loaded" && hideEmptyMarginaliaSessions
      ? marginaliaState.result.items.filter((item) => item.annotationCount === 0).length
      : 0;
  const visibleMarginaliaSummary = {
    bookCount: visibleMarginaliaGroups.length,
    sessionCount: visibleMarginaliaGroups.reduce((total, group) => total + group.items.length, 0),
    annotationCount: visibleMarginaliaGroups.reduce(
      (total, group) => total + group.items.reduce((groupTotal, item) => groupTotal + item.annotationCount, 0),
      0,
    ),
  };

  if (!active) return null;

  return (
    <div className="settingsTabPanel">
      <section className="panel settingsCard settingsMaintenance">
        <div className="settingsSectionHeader">
          <h2 className="panelTitle">Split Marginalia export</h2>
        </div>
        <div className="settingsCopyBlock">
          <p>Split a Second Pass Marginalia export into one file per Reading Session.</p>
          <p className="muted">
            This tool only repackages the export. It does not repair locations, match text, import annotations, or
            contact Second Pass Library.
          </p>
        </div>
        <div className="settingsControlBlock">
          <div className="settingsFileRow">
            <label className="button" htmlFor="marginaliaExportFile">
              Choose export file
            </label>
            <input
              id="marginaliaExportFile"
              className="settingsHiddenFileInput"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleMarginaliaFile(event.currentTarget.files?.[0] ?? null)}
            />
            {marginaliaState.phase !== "idle" ? (
              <button type="button" className="button" onClick={clearMarginaliaFile}>
                Clear
              </button>
            ) : null}
          </div>
          <p className="muted">Creates individual Reading Session files and grouped ZIP downloads.</p>
        </div>

        {marginaliaState.phase === "error" ? <p className="errorText">{marginaliaState.message}</p> : null}
        {marginaliaState.phase === "loaded" ? (
          <div className="marginaliaSplitPanel">
            <div className="settingsGrid marginaliaSplitSummary">
              <SettingsDetailRow label="File" value={marginaliaState.fileName} />
              <div className="settingsStatRow" aria-label="Export summary">
                <span className="settingsStatChip">Books: {visibleMarginaliaSummary.bookCount}</span>
                <span className="settingsStatChip">Reading Sessions: {visibleMarginaliaSummary.sessionCount}</span>
                <span className="settingsStatChip">Annotations: {visibleMarginaliaSummary.annotationCount}</span>
                <label className="settingsCheckboxRow settingsStatFilter">
                  <input
                    type="checkbox"
                    checked={hideEmptyMarginaliaSessions}
                    onChange={(event) => setHideEmptyMarginaliaSessions(event.currentTarget.checked)}
                  />
                  <span>Hide empty Reading Sessions</span>
                </label>
                {hiddenEmptySessionCount > 0 ? (
                  <span className="muted">
                    {hiddenEmptySessionCount} empty Reading Session{hiddenEmptySessionCount === 1 ? "" : "s"} hidden.
                  </span>
                ) : null}
              </div>
            </div>
            {marginaliaState.result.items.length === 0 ? (
              <p className="muted">No Reading Sessions found in this export.</p>
            ) : visibleMarginaliaGroups.length === 0 ? (
              <p className="muted">No Reading Sessions with annotations match this filter.</p>
            ) : (
              <>
                <div className="settingsActions">
                  <button type="button" className="button" onClick={() => downloadAllMarginaliaZip(visibleMarginaliaGroups)}>
                    Download all
                  </button>
                  <span className="muted">Includes one folder per Book and one JSON file per visible Reading Session.</span>
                </div>
                <div className="marginaliaSplitList">
                  {visibleMarginaliaGroups.map((group) => (
                    <div className="marginaliaSplitGroup" key={group.id}>
                      <div className="marginaliaSplitGroupHeader">
                        <div className="settingsLabel">{group.bookLabel}</div>
                        <button type="button" className="button" onClick={() => downloadMarginaliaBookZip(group)}>
                          Download Book ZIP
                        </button>
                      </div>
                      <div className="marginaliaSplitGroupItems">
                        {group.items.map((item) => (
                          <div className="marginaliaSplitItem" key={item.id}>
                            <div className="marginaliaSplitText">
                              <div className="muted">{formatMarginaliaSessionLabel(item.session)}</div>
                              <div className="muted">
                                {item.annotationCount} annotation{item.annotationCount === 1 ? "" : "s"}
                              </div>
                            </div>
                            <button type="button" className="button" onClick={() => downloadMarginaliaSplit(item)}>
                              Download Reading Session JSON
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>
      <DebugLoggingSettingsPanel />
    </div>
  );
}
