import { navigateTo, routeToHash } from "../../app/AppNavigation.Router";
import { HomeShelfCard } from "./HomeShelfCard.UI";
import { getAuthRecoveryMessage, getPageLoadErrorMessage } from "../../app/AppUserFacingErrors.Mapper";
import { PageLoadErrorNotice } from "../../app/AppPageLoadErrorNotice.UI";
import type { HomeShelvesPreview } from "./HomePreview.Controller";

export function ShelvesPreviewLoadFailure({
  error,
  disabled,
  onRetry,
}: {
  error: unknown;
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <PageLoadErrorNotice
      error={error}
      message={getPageLoadErrorMessage(
        error,
        "Couldn't load shelves.",
        getAuthRecoveryMessage("load shelves"),
      )}
      onRetry={onRetry}
      retryDisabled={disabled}
      className="muted"
    />
  );
}

export function ShelvesPreviewSection({
  preview,
  serverBaseUrl,
}: {
  preview: HomeShelvesPreview;
  serverBaseUrl?: string | null;
}) {
  const { canLoad, busy, error, shelves } = preview;

  return (
    <div className="shelfPreviewSection">
      <div className="panelHeaderRow" style={{ marginBottom: 8 }}>
        <div className="panelTitle" style={{ margin: 0 }}>
          Shelves
        </div>
        <button type="button" className="button buttonCompact" onClick={() => navigateTo({ kind: "shelves" })}>
          View all
        </button>
      </div>

      {!canLoad ? <div className="muted">Verify the connection to load shelves.</div> : null}
      {busy ? <div className="muted">Loading shelves...</div> : null}
      {error ? (
        <ShelvesPreviewLoadFailure
          error={error}
          onRetry={preview.retry}
          disabled={!canLoad || busy}
        />
      ) : null}

      {canLoad && !busy && !error && shelves && shelves.length === 0 ? <div className="muted">No shelves yet.</div> : null}

      {shelves?.length ? (
        <div className="homeShelfGrid">
          {shelves.map((shelf) => (
            <HomeShelfCard
              key={shelf.id}
              shelf={shelf}
              baseUrl={serverBaseUrl}
              href={routeToHash({ kind: "shelf", shelfId: String(shelf.id) })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
