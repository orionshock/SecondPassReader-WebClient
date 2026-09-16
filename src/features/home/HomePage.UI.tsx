import { useMemo, useState } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ActiveConnection } from "../../storage/ActiveConnection.Store";
import { navigateTo } from "../../app/AppNavigation.Router";
import { RecentReadingSection } from "../library/RecentReadingPanel.UI";
import { getConnectionStatus } from "../connection/ConnectionStatus.Presenter";
import { ShelvesPreviewSection } from "./ShelvesPreviewPanel.UI";
import { startLibraryGlobalSearch } from "../../app/routes/AppLibraryRoute.Policy";
import {
  useHomePreviewLifetime,
  useHomeRecentPreview,
  useHomeShelvesPreview,
} from "./HomePreview.Controller";

const HOME_LIBRARY_SEARCH_LABEL = "Search Library";
const HOME_LIBRARY_SEARCH_PLACEHOLDER = "Search books, authors, series, and publishers...";

export function HomePage({
  connection,
  spl,
  offlineNamespaceKey = null,
}: {
  connection: ActiveConnection | null;
  spl: SecondPassClient | null;
  offlineNamespaceKey?: string | null;
}) {
  const status = useMemo(() => getConnectionStatus(connection), [connection]);
  const [homeSearch, setHomeSearch] = useState("");
  const previewLifetime = useHomePreviewLifetime(status === "verified" ? spl : null, offlineNamespaceKey);
  const recentPreview = useHomeRecentPreview(previewLifetime);
  const shelvesPreview = useHomeShelvesPreview(previewLifetime);

  return (
    <section className="panel">
      <h1 className="panelTitle">Home</h1>

      {status === "not_configured" ? <p className="muted">Connect to Second Pass Library to use Home.</p> : null}
      {status === "configured" ? <p className="muted">Approve this browser before loading Home.</p> : null}
      {status === "linked" ? <p className="muted">Verify the connection before loading Home.</p> : null}

      {status === "verified" ? (
        <>
          <div>
            <div className="panelHeaderRow" style={{ marginBottom: 8 }}>
              <div className="panelTitle" style={{ margin: 0 }}>
                {HOME_LIBRARY_SEARCH_LABEL}
              </div>
            </div>
            <form
              className="libraryToolbar"
              onSubmit={(e) => {
                e.preventDefault();
                const nextRoute = startLibraryGlobalSearch(homeSearch);
                if (nextRoute) navigateTo(nextRoute);
              }}
            >
              <label className="toolbarField toolbarSearch">
                <span className="srOnly">{HOME_LIBRARY_SEARCH_LABEL}</span>
                <input
                  className="input inputCompact"
                  value={homeSearch}
                  onChange={(e) => setHomeSearch(e.target.value)}
                  placeholder={HOME_LIBRARY_SEARCH_PLACEHOLDER}
                  aria-label={HOME_LIBRARY_SEARCH_LABEL}
                />
              </label>
              <button className="button buttonPrimary" type="submit">
                Search
              </button>
            </form>
          </div>

          <RecentReadingSection connection={connection} preview={recentPreview} />

          <ShelvesPreviewSection
            preview={shelvesPreview}
            serverBaseUrl={connection?.serverBaseUrl}
          />
        </>
      ) : null}
    </section>
  );
}
