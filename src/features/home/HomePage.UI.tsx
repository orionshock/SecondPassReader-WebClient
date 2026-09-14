import { useMemo, useState } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { navigateTo } from "../../app/AppNavigation.Router";
import { RecentReadingSection } from "../library/RecentReadingPanel.UI";
import { getConnectionStatus } from "../connection/ConnectionStatus.Presenter";
import { ShelvesPreviewSection } from "./ShelvesPreviewPanel.UI";
import { startLibraryGlobalSearch } from "../../app/routes/AppLibraryRoute.Policy";

const HOME_LIBRARY_SEARCH_LABEL = "Search Library";
const HOME_LIBRARY_SEARCH_PLACEHOLDER = "Search books, authors, series, and publishers...";

export function HomePage({
  profile,
  spl,
  offlineNamespaceKey = null,
}: {
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  offlineNamespaceKey?: string | null;
}) {
  const status = useMemo(() => getConnectionStatus(profile), [profile]);
  const [homeSearch, setHomeSearch] = useState("");

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

          <RecentReadingSection profile={profile} spl={spl} offlineNamespaceKey={offlineNamespaceKey} />

          <ShelvesPreviewSection
            spl={spl}
            serverBaseUrl={profile?.serverBaseUrl}
            offlineNamespaceKey={offlineNamespaceKey}
          />
        </>
      ) : null}
    </section>
  );
}
