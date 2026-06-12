import { useMemo, useState } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { navigateTo } from "../../app/navigation";
import { RecentReadingSection } from "../library/RecentReadingSection";
import { getConnectionStatus } from "../connection/connectionStatus";
import { ShelvesPreviewSection } from "./ShelvesPreviewSection";

export function HomePage({
  profile,
  spl,
}: {
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
}) {
  const status = useMemo(() => getConnectionStatus(profile), [profile]);
  const [homeSearch, setHomeSearch] = useState("");

  return (
    <section className="panel">
      <h2 className="panelTitle">Home</h2>

      {status === "not_configured" ? <p className="muted">Select a server profile first.</p> : null}
      {status === "configured" ? <p className="muted">Link this profile before loading the library.</p> : null}
      {status === "linked" ? <p className="muted">Verify this profile before loading the library.</p> : null}

      {status === "verified" ? (
        <>
          <div>
            <div className="panelHeaderRow" style={{ marginBottom: 8 }}>
              <div className="panelTitle" style={{ margin: 0 }}>
                Search the Library
              </div>
            </div>
            <form
              className="libraryToolbar"
              onSubmit={(e) => {
                e.preventDefault();
                const q = homeSearch.trim();
                navigateTo(q ? { kind: "library", q } : { kind: "library" });
              }}
            >
              <label className="toolbarField toolbarSearch">
                <span className="srOnly">Search</span>
                <input
                  className="input inputCompact"
                  value={homeSearch}
                  onChange={(e) => setHomeSearch(e.target.value)}
                  placeholder="Search..."
                />
              </label>
              <button className="button buttonPrimary" type="submit">
                Search
              </button>
            </form>
          </div>

          <RecentReadingSection profile={profile} spl={spl} />

          <ShelvesPreviewSection spl={spl} />
        </>
      ) : null}
    </section>
  );
}
