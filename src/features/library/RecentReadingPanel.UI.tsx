import type { ActiveConnection } from "../../storage/ActiveConnection.Store";
import { routeToHash } from "../../app/AppNavigation.Router";
import { getAuthRecoveryMessage, getPageLoadErrorMessage } from "../../app/AppUserFacingErrors.Mapper";
import { PageLoadErrorNotice } from "../../app/AppPageLoadErrorNotice.UI";
import { RecentReadingCarousel } from "./RecentReadingCarousel.UI";
import type { HomeRecentPreview } from "../home/HomePreview.Controller";

const RECENT_READING_ERROR = "Couldn't load Recent History.";

export function RecentReadingLoadFailure({
  error,
  disabled,
  onRetry,
}: {
  error: unknown;
  disabled: boolean;
  onRetry: () => void;
}) {
  const message = getPageLoadErrorMessage(
    error,
    RECENT_READING_ERROR,
    getAuthRecoveryMessage("load Recent History"),
  );
  return (
    <PageLoadErrorNotice
      error={error}
      message={message}
      onRetry={onRetry}
      retryDisabled={disabled}
    />
  );
}

export function RecentReadingSection({
  connection,
  preview,
}: {
  connection: ActiveConnection | null;
  preview: HomeRecentPreview;
}) {
  const { busy, error, data, canLoad, showClosed } = preview;

  return (
    <div className="recentReadingSection">
      <div className="panelHeaderRow recentReadingHeader">
        <div className="panelTitle" style={{ margin: 0 }}>
          Recent History
        </div>
        <div className="recentReadingHeaderActions">
          <span className="muted">
            {busy ? "Loading..." : data && data.results.length > 1 ? `${data.results.length} Reading Sessions` : null}
          </span>
          <button
            type="button"
            className={`button buttonCompact${showClosed ? " buttonPrimary" : ""}`}
            aria-pressed={showClosed}
            disabled={busy}
            onClick={preview.toggleClosed}
          >
            Include closed
          </button>
          <a className="button buttonCompact recentReadingViewAll" href={routeToHash({ kind: "sessions" })}>
            View all
          </a>
        </div>
      </div>

      {error ? (
        <RecentReadingLoadFailure error={error} onRetry={preview.retry} disabled={!canLoad || busy} />
      ) : null}

      {!busy && !error && (!data?.results || data.results.length === 0) ? <div className="muted">No Recent History yet.</div> : null}

      {data?.results?.length ? (
        <RecentReadingCarousel
          items={data.results}
          connection={connection}
          disabled={!canLoad}
          onResume={preview.resume}
        />
      ) : null}
    </div>
  );
}
