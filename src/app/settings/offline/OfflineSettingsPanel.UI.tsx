import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { OfflineReaderSyncClient } from "../../offline/reader/sync/OfflineReaderSync.Actions";
import {
  createOfflineSettingsController,
  type OfflineSettingsAsset,
  type OfflineSettingsController,
  type OfflineSettingsState,
} from "./OfflineSettings.Controller";
import { formatOfflineAssetBytes } from "./OfflineSettings.Presenter";
import type { OfflinePendingBook } from "./OfflinePendingWork.Presenter";

export function OfflineSettingsPanel({
  namespaceKey,
  client,
  selectedBookId,
  onSelectBook,
  onOpenReader,
}: {
  namespaceKey: string | null;
  client: OfflineReaderSyncClient | null;
  selectedBookId: string | null;
  onSelectBook(bookId: string): void;
  onOpenReader(bookId: string): void;
}) {
  const controller = useMemo(
    () => createOfflineSettingsController({ namespaceKey, client }),
    [client, namespaceKey],
  );
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => controller.start(), [controller]);

  return (
    <OfflineSettingsView
      state={state}
      controller={controller}
      clientAvailable={Boolean(client)}
      selectedBookId={selectedBookId}
      onSelectBook={onSelectBook}
      onOpenReader={onOpenReader}
    />
  );
}

export function OfflineSettingsView({
  state,
  controller,
  clientAvailable,
  selectedBookId = null,
  onSelectBook = () => undefined,
  onOpenReader = () => undefined,
}: {
  state: OfflineSettingsState;
  controller: OfflineSettingsController;
  clientAvailable: boolean;
  selectedBookId?: string | null;
  onSelectBook?(bookId: string): void;
  onOpenReader?(bookId: string): void;
}) {
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);

  useEffect(() => {
    if (state.assets.length === 0) setConfirmRemoveAll(false);
  }, [state.assets.length]);

  if (state.status === "loading") {
    return <section className="panel settingsCard"><p className="muted" role="status">Loading offline data...</p></section>;
  }
  if (state.status === "unavailable") {
    return <section className="panel settingsCard"><p className="muted">{state.message}</p></section>;
  }
  if (state.status === "error") {
    return (
      <section className="panel settingsCard">
        <p className="errorText">{state.message}</p>
      </section>
    );
  }

  const busy = state.action !== "idle";
  const retryDisabled = busy || !clientAvailable || state.pending.books === 0 || state.connectivity !== "online";

  return (
    <div className="settingsTabPanel">
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
            {state.action === "syncing" ? "Retrying..." : "Retry sync"}
          </button>
        </div>
        {state.pending.intents > 0 ? (
          <div>
            <div className="settingsStatRow muted">
              <span>{state.pending.intents} change{state.pending.intents === 1 ? "" : "s"} waiting to sync</span>
              <span>{state.pending.annotations} annotation{state.pending.annotations === 1 ? "" : "s"}</span>
              <span>{state.pending.progress} reading position{state.pending.progress === 1 ? "" : "s"}</span>
              <span>{state.pending.sessionEstablishment} Reading Session{state.pending.sessionEstablishment === 1 ? "" : "s"} to reconnect</span>
              {state.pending.attentionBooks > 0 ? <span>{state.pending.attentionBooks} Book{state.pending.attentionBooks === 1 ? "" : "s"} need{state.pending.attentionBooks === 1 ? "s" : ""} attention</span> : null}
              {state.pending.deferredBooks > 0 ? <span>{state.pending.deferredBooks} Book{state.pending.deferredBooks === 1 ? "" : "s"} waiting to retry</span> : null}
            </div>
            <div className="settingsOfflineAssetList">
              {state.pendingBooks.map((book) => (
                <PendingBookRow
                  key={book.bookId}
                  book={book}
                  selected={selectedBookId === book.bookId}
                  disabled={busy}
                  connectivity={state.connectivity}
                  working={state.activeBookId === book.bookId}
                  onSelect={() => onSelectBook(book.bookId)}
                  onRetry={() => void controller.retryBook(book.bookId)}
                  onOpenReader={() => onOpenReader(book.bookId)}
                  onDiscardProgress={() => {
                    if (window.confirm("Discard the pending reading position? It will no longer sync, but the Reader will keep it for local resume.")) {
                      void controller.discardPendingProgress(book.bookId);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        ) : <p className="muted">All changes are synced.</p>}
        {state.connectivity !== "online" && state.pending.books > 0 ? (
          <p className="muted">Go online to retry changes.</p>
        ) : null}
      </section>

      <section className="panel settingsCard">
        <div className="settingsSectionHeader">
          <div>
            <h2 className="panelTitle">Available offline</h2>
            <div className="settingsLabel">
              {state.assets.length} Book{state.assets.length === 1 ? "" : "s"} - {formatOfflineAssetBytes(state.totalAssetBytes)}
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
            <p>Remove all offline copies? Downloaded Book files will be removed. Reading progress, annotations, and changes waiting to sync will remain.</p>
            <div className="settingsActions">
              <button type="button" className="button" disabled={busy} onClick={() => setConfirmRemoveAll(false)}>Cancel</button>
              <button type="button" className="button buttonDanger" disabled={busy} onClick={() => void controller.removeAllAssets()}>
                {state.action === "removing-all" ? "Removing..." : "Remove offline copies"}
              </button>
            </div>
          </div>
        ) : null}

        {state.assets.length === 0 ? (
          <p className="muted">No Books are available offline.</p>
        ) : (
          <div className="settingsOfflineAssetList">
            {state.assets.map((asset) => (
              <OfflineAssetRow
                key={asset.key}
                asset={asset}
                disabled={busy}
                removing={state.action === "removing" && state.removingAssetKey === asset.key}
                selected={selectedBookId === asset.bookId}
                onSelect={() => onSelectBook(asset.bookId)}
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
  selected,
  onSelect,
  onRemove,
}: {
  asset: OfflineSettingsAsset;
  disabled: boolean;
  removing: boolean;
  selected: boolean;
  onSelect(): void;
  onRemove(): void;
}) {
  return (
    <div className="settingsOfflineAssetRow" aria-current={selected ? "true" : undefined}>
      <div className="settingsOfflineAssetCopy">
        <div className="settingsLabel">{asset.title}</div>
        <div className="muted">{asset.format.toUpperCase()} - {formatOfflineAssetBytes(asset.byteLength)}</div>
        {selected
          ? <span className="muted">Details shown</span>
          : <button type="button" className="settingsLinkButton" onClick={onSelect} disabled={disabled}>Show details</button>}
      </div>
      <button type="button" className="button" disabled={disabled} onClick={onRemove} aria-label={`Remove offline copy of ${asset.title}`}>
        {removing ? "Removing..." : "Remove"}
      </button>
    </div>
  );
}

function PendingBookRow({
  book,
  selected,
  disabled,
  connectivity,
  working,
  onSelect,
  onRetry,
  onOpenReader,
  onDiscardProgress,
}: {
  book: OfflinePendingBook;
  selected: boolean;
  disabled: boolean;
  connectivity: OfflineSettingsState["connectivity"];
  working: boolean;
  onSelect(): void;
  onRetry(): void;
  onOpenReader(): void;
  onDiscardProgress(): void;
}) {
  return (
    <div className="settingsOfflineAssetRow" aria-current={selected ? "true" : undefined}>
      <div className="settingsOfflineAssetCopy">
        <div className="settingsLabel">{book.title}</div>
        <div className="muted">
          {book.pendingIntentCount} change{book.pendingIntentCount === 1 ? "" : "s"} waiting to sync
          {book.status !== "waiting" ? ` - ${pendingBookStatusLabel(book.status)}` : ""}
        </div>
        {selected
          ? <span className="muted">Details shown</span>
          : <button type="button" className="settingsLinkButton" onClick={onSelect} disabled={disabled}>Show details</button>}
        {selected ? (
          <div className="settingsGrid">
            {book.needsSessionEstablishment ? <div>Reading Session: {categoryStatusLabel(book.sessionStatus)}</div> : null}
            {book.hasProgress ? <div>Reading position: {categoryStatusLabel(book.progressStatus)}</div> : null}
            {book.annotationUpsertCount > 0 ? (
              <div>{countLabel(book.annotationUpsertCount, "annotation change", "annotation changes")}: {categoryStatusLabel(book.annotationStatus)}</div>
            ) : null}
            {book.annotationDeleteCount > 0 ? (
              <div>{countLabel(book.annotationDeleteCount, "annotation deletion", "annotation deletions")}: {categoryStatusLabel(book.annotationStatus)}</div>
            ) : null}
            {book.hasOfflineAsset ? (
              <div className="muted">Available offline: {book.assetFormats.join(", ")} - {formatOfflineAssetBytes(book.assetBytes)}</div>
            ) : null}
            <div className="settingsActions">
              <button type="button" className="button buttonPrimary" disabled={disabled || connectivity !== "online"} onClick={onRetry}>
                {working ? "Retrying..." : "Retry this book"}
              </button>
              <button type="button" className="button" disabled={disabled} onClick={onOpenReader}>Open reader</button>
              {book.hasProgress ? (
                <button type="button" className="button" disabled={disabled} onClick={onDiscardProgress}>
                  Discard pending reading position
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function pendingBookStatusLabel(status: OfflinePendingBook["status"]): string {
  switch (status) {
    case "waiting": return "Waiting to sync";
    case "deferred": return "Waiting to retry";
    case "needs-attention": return "Needs attention";
    case "connection-repair": return "Connection needs repair";
    case "authority-blocked": return "Waiting for server access";
  }
}

function categoryStatusLabel(status: OfflinePendingBook["status"] | null): string {
  return status ? pendingBookStatusLabel(status) : "Waiting to sync";
}

function pendingLabel(books: number): string {
  if (books === 0) return "No books waiting to sync";
  return `${books} book${books === 1 ? "" : "s"} waiting to sync`;
}
