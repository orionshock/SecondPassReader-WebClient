import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { OfflineReaderSyncClient } from "../../offline/OfflineReaderSync.Actions";
import {
  createOfflineSettingsController,
  type OfflineSettingsAsset,
  type OfflineSettingsController,
  type OfflineSettingsState,
} from "./OfflineSettings.Controller";
import { formatOfflineAssetBytes } from "./OfflineSettings.Presenter";

export function OfflineSettingsPanel({
  namespaceKey,
  client,
}: {
  namespaceKey: string | null;
  client: OfflineReaderSyncClient | null;
}) {
  const controller = useMemo(
    () => createOfflineSettingsController({ namespaceKey, client }),
    [client, namespaceKey],
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => controller.start(), [controller]);

  return <OfflineSettingsView state={state} controller={controller} clientAvailable={Boolean(client)} />;
}

export function OfflineSettingsView({
  state,
  controller,
  clientAvailable,
}: {
  state: OfflineSettingsState;
  controller: OfflineSettingsController;
  clientAvailable: boolean;
}) {
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);

  useEffect(() => {
    if (state.assets.length === 0) setConfirmRemoveAll(false);
  }, [state.assets.length]);

  if (state.status === "loading") {
    return <section className="panel settingsCard" role="tabpanel"><p className="muted">Loading offline data...</p></section>;
  }
  if (state.status === "unavailable") {
    return <section className="panel settingsCard" role="tabpanel"><p className="muted">{state.message}</p></section>;
  }
  if (state.status === "error") {
    return (
      <section className="panel settingsCard" role="tabpanel">
        <p className="errorText">{state.message}</p>
      </section>
    );
  }

  const busy = state.action !== "idle";
  const retryDisabled = busy || !clientAvailable || state.pending.books === 0 || state.connectivity !== "online";

  return (
    <div className="settingsTabPanel" role="tabpanel" aria-label="Offline settings">
      <section className="panel settingsCard">
        <div className="settingsSectionHeader">
          <div>
            <h2 className="panelTitle">Pending sync</h2>
            <div className="settingsLabel">{pendingLabel(state.pending.books)}</div>
          </div>
          <button
            type="button"
            className="button buttonPrimary"
            disabled={retryDisabled}
            onClick={() => void controller.retrySync()}
          >
            {state.action === "syncing" ? "Retrying sync..." : "Retry sync"}
          </button>
        </div>
        {state.pending.intents > 0 ? (
          <div className="settingsStatRow muted">
            <span>{state.pending.intents} pending change{state.pending.intents === 1 ? "" : "s"}</span>
            <span>{state.pending.annotations} annotation{state.pending.annotations === 1 ? "" : "s"}</span>
            <span>{state.pending.progress} progress update{state.pending.progress === 1 ? "" : "s"}</span>
            <span>{state.pending.sessionEstablishment} session continuation{state.pending.sessionEstablishment === 1 ? "" : "s"}</span>
          </div>
        ) : <p className="muted">All offline changes are synced.</p>}
        {state.connectivity !== "online" && state.pending.books > 0 ? (
          <p className="muted">Connect to the library to retry pending changes.</p>
        ) : null}
      </section>

      <section className="panel settingsCard">
        <div className="settingsSectionHeader">
          <div>
            <h2 className="panelTitle">Available offline</h2>
            <div className="settingsLabel">
              {state.assets.length} book{state.assets.length === 1 ? "" : "s"} - {formatOfflineAssetBytes(state.totalAssetBytes)}
            </div>
          </div>
          {state.assets.length > 0 && !confirmRemoveAll ? (
            <button type="button" className="button buttonDanger" disabled={busy} onClick={() => setConfirmRemoveAll(true)}>
              Remove all offline copies
            </button>
          ) : null}
        </div>

        {confirmRemoveAll ? (
          <div className="settingsOfflineConfirmation" role="alert">
            <p>Remove all downloaded book files for this library? Offline reading will no longer be available, but reading progress, annotations, and pending changes will remain.</p>
            <div className="settingsActions">
              <button type="button" className="button" disabled={busy} onClick={() => setConfirmRemoveAll(false)}>Cancel</button>
              <button type="button" className="button buttonDanger" disabled={busy} onClick={() => void controller.removeAllAssets()}>
                {state.action === "removing-all" ? "Removing..." : "Remove offline copies"}
              </button>
            </div>
          </div>
        ) : null}

        {state.assets.length === 0 ? (
          <p className="muted">No books are currently available offline.</p>
        ) : (
          <div className="settingsOfflineAssetList">
            {state.assets.map((asset) => (
              <OfflineAssetRow
                key={asset.key}
                asset={asset}
                disabled={busy}
                removing={state.action === "removing" && state.removingAssetKey === asset.key}
                onRemove={() => void controller.removeAsset(asset)}
              />
            ))}
          </div>
        )}
        {state.message ? <p className="errorText">{state.message}</p> : null}
      </section>
    </div>
  );
}

function OfflineAssetRow({
  asset,
  disabled,
  removing,
  onRemove,
}: {
  asset: OfflineSettingsAsset;
  disabled: boolean;
  removing: boolean;
  onRemove(): void;
}) {
  return (
    <div className="settingsOfflineAssetRow">
      <div className="settingsOfflineAssetCopy">
        <div className="settingsLabel">{asset.title}</div>
        <div className="muted">{asset.format.toUpperCase()} - {formatOfflineAssetBytes(asset.byteLength)}</div>
      </div>
      <button type="button" className="button" disabled={disabled} onClick={onRemove}>
        {removing ? "Removing..." : "Remove"}
      </button>
    </div>
  );
}

function pendingLabel(books: number): string {
  if (books === 0) return "No books waiting to sync";
  return `${books} book${books === 1 ? "" : "s"} waiting to sync`;
}
