import { useMemo, useState } from "react";
import type { LibraryBook } from "../../schemas/library";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { navigateTo } from "../../app/navigation";
import { openBookForReader } from "../library/openBookForReader";
import { RecentReadingSection } from "../library/RecentReadingSection";
import type { OpenedBook } from "../reader";
import { getConnectionStatus } from "../connection/connectionStatus";

export function HomePage({
  profile,
  onBookOpened,
}: {
  profile: ConnectionProfile | null;
  onBookOpened?: (opened: OpenedBook) => void;
}) {
  const status = useMemo(() => getConnectionStatus(profile), [profile]);
  const [homeSearch, setHomeSearch] = useState("");
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);

  async function handleOpenReader(book: LibraryBook) {
    if (!profile) return;
    if (resumeBusy) return;
    setResumeBusy(true);
    setResumeError(null);
    try {
      navigateTo({ kind: "reader", bookId: String(book.id) });
      const opened = await openBookForReader({ profile, book });
      onBookOpened?.(opened);
    } catch (e) {
      setResumeError(e instanceof Error ? e.message : "Failed to open reader.");
      navigateTo({ kind: "home" });
    } finally {
      setResumeBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panelTitle">Home</h2>

      {status === "not_configured" ? <p className="muted">Select a server profile first.</p> : null}
      {status === "configured" ? <p className="muted">Link this profile before loading the library.</p> : null}
      {status === "linked" ? <p className="muted">Verify this profile before loading the library.</p> : null}

      {status === "verified" ? (
        <>
          {resumeError ? <div className="errorText">{resumeError}</div> : null}
          <RecentReadingSection profile={profile} onOpenReader={handleOpenReader} />

          <div style={{ marginTop: 16 }}>
            <div className="panelHeaderRow" style={{ marginBottom: 8 }}>
              <div className="panelTitle" style={{ margin: 0 }}>
                Shelves
              </div>
              <button type="button" className="button buttonCompact" onClick={() => navigateTo({ kind: "shelves" })}>
                Open
              </button>
            </div>
            <div className="muted">Shelves are not wired in this client yet.</div>
          </div>

          <div style={{ marginTop: 16 }}>
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
              <button className="button buttonPrimary" type="submit" disabled={resumeBusy}>
                Search
              </button>
            </form>
          </div>
        </>
      ) : null}
    </section>
  );
}

