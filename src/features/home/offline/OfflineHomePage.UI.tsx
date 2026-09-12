import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getSessionDisplayName } from "../../sessions/SessionDisplayName.Presenter";
import { createOfflineHomeController } from "./OfflineHome.Controller";

export function OfflineHomePage({
  namespaceKey,
  onViewBook,
  onOpenLibrary,
}: {
  namespaceKey: string | null;
  onViewBook(bookId: string): void;
  onOpenLibrary(): void;
}) {
  const controller = useMemo(() => createOfflineHomeController(namespaceKey), [namespaceKey]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => controller.start(), [controller]);

  if (state.status === "loading") return <p className="muted">{`Loading saved Home${"\u2026"}`}</p>;
  if (state.status === "unavailable") return <p className="muted">Saved Home is unavailable until this connection is verified.</p>;
  if (state.status === "error") return <div className="errorText">Saved Home data could not be loaded.</div>;

  const hasContent = state.recent.status === "available" || state.shelves.status === "available";
  return (
    <section className="panel offlineHomePanel">
      <div className="panelHeaderRow">
        <div>
          <h1 className="panelTitle">Home</h1>
          <p className="muted offlineHomeContext">Showing saved recent activity from this device.</p>
        </div>
        <button type="button" className="button buttonCompact" onClick={onOpenLibrary}>Offline Library</button>
      </div>

      {!hasContent ? (
        <div className="emptyState">
          <h2>Home is not available offline yet.</h2>
          <p className="muted">Books saved for offline reading are available in Library.</p>
          <button type="button" className="button buttonPrimary" onClick={onOpenLibrary}>Open Offline Library</button>
        </div>
      ) : null}

      {state.recent.status === "available" ? (
        <section className="recentReadingSection" aria-labelledby="offline-home-recent-title">
          <div className="panelHeaderRow recentReadingHeader">
            <h2 id="offline-home-recent-title" className="panelTitle offlineHomeSectionTitle">Recent History</h2>
            <span className="muted">Saved preview</span>
          </div>
          {state.recent.items.length === 0 ? <p className="muted">No recent reading in the saved preview.</p> : (
            <div className="offlineHomeRecentList">
              {state.recent.items.map((item) => (
                <article key={item.sessionId} className="offlineHomeRecentItem">
                  <div className="bookCover bookCoverSmall" aria-hidden="true"><span className="bookCoverPlaceholderText">No cover</span></div>
                  <div className="offlineHomeRecentMain">
                    <strong>{item.bookTitle}</strong>
                    <span className="muted">
                      {getSessionDisplayName(item.sessionName, item.sessionId)} {"\u00b7"} {item.sessionStatus === "closed" ? "Closed" : "Active"}
                    </span>
                    {item.progress?.locationLabel ? <span>{item.progress.locationLabel}</span> : null}
                    {!item.offlineReadable ? <span className="muted">Not available offline</span> : null}
                  </div>
                  <button
                    type="button"
                    className="button buttonCompact"
                    onClick={() => onViewBook(item.bookId)}
                  >
                    View details
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {state.shelves.status === "available" ? (
        <section className="shelfPreviewSection" aria-labelledby="offline-home-shelves-title">
          <div className="panelHeaderRow">
            <h2 id="offline-home-shelves-title" className="panelTitle offlineHomeSectionTitle">Shelves</h2>
            <span className="muted">Saved preview {"\u00b7"} Read only</span>
          </div>
          {state.shelves.items.length === 0 ? <p className="muted">No shelves in the saved preview.</p> : (
            <div className="homeShelfGrid">
              {state.shelves.items.map((shelf) => (
                <article key={shelf.shelfId} className="homeShelfCard offlineHomeShelfCard">
                  <span className="previewBookCoverTile previewBookCoverTileEmpty" aria-hidden="true">
                    <span className="previewBookCoverPlaceholder">Saved</span>
                  </span>
                  <span className="homeShelfCardText">
                    <span className="homeShelfName">{shelf.name}</span>
                    <span className="homeShelfMetadata">
                      {shelf.ownerLabel ? <span className="homeShelfOwner">{shelf.ownerLabel}</span> : null}
                      <span>{shelf.bookCount} {shelf.bookCount === 1 ? "book" : "books"}</span>
                    </span>
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
