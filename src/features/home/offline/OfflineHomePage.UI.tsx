import { useEffect, useMemo, useSyncExternalStore } from "react";
import { OfflinePublicationCoverImage } from "../../../app/offline/publication/OfflinePublicationCoverImage.UI";
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

  if (state.status === "loading") return <p className="muted">Loading saved Home...</p>;
  if (state.status === "unavailable") return <p className="muted">Verify the connection to view saved Home data.</p>;
  if (state.status === "error") return <div className="errorText">Saved Home data isn't available. Check browser storage settings and reload the app.</div>;

  const hasContent = state.recent.status === "available" || state.shelves.status === "available";
  return (
    <section className="panel offlineHomePanel">
      <div className="panelHeaderRow">
        <div>
          <h1 className="panelTitle">Home</h1>
          <p className="muted offlineHomeContext">Saved activity from this browser.</p>
        </div>
        <button type="button" className="button buttonCompact" onClick={onOpenLibrary}>Library</button>
      </div>

      {!hasContent ? (
        <div className="emptyState">
          <h2>No saved Home data</h2>
          <p className="muted">Books available offline are still in Library.</p>
          <button type="button" className="button buttonPrimary" onClick={onOpenLibrary}>Open Library</button>
        </div>
      ) : null}

      {state.recent.status === "available" ? (
        <section className="recentReadingSection" aria-labelledby="offline-home-recent-title">
          <div className="panelHeaderRow recentReadingHeader">
            <h2 id="offline-home-recent-title" className="panelTitle offlineHomeSectionTitle">Recent History</h2>
            <span className="muted">Saved</span>
          </div>
          {state.recent.items.length === 0 ? <p className="muted">No saved Reading Sessions.</p> : (
            <div className="offlineHomeRecentList">
              {state.recent.items.map((item) => (
                <article key={item.sessionId} className="offlineHomeRecentItem">
                  <div className="bookCover bookCoverSmall">
                    <OfflinePublicationCoverImage
                      blob={item.coverBlob}
                      alt=""
                      imageClassName="bookCoverImg"
                      placeholderClassName="bookCoverPlaceholderText"
                    />
                  </div>
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
            <span className="muted">Saved {"\u00b7"} Read-only</span>
          </div>
          {state.shelves.items.length === 0 ? <p className="muted">No saved shelves.</p> : (
            <div className="homeShelfGrid">
              {state.shelves.items.map((shelf) => (
                <article key={shelf.shelfId} className="homeShelfCard offlineHomeShelfCard">
                  <span className="previewBookCoverTile previewBookCoverTileEmpty" aria-hidden="true">
                    <span className="previewBookCoverPlaceholder">Shelf</span>
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
