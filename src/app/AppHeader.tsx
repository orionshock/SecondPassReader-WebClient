import type { ConnectionProfile } from "../storage/connectionProfiles";

export function AppHeader({
  profile,
  view,
  readerOpen,
  onShowLibrary,
  onShowSettings,
  onBackToLibrary,
}: {
  profile: ConnectionProfile | null;
  view: "main" | "settings";
  readerOpen: boolean;
  onShowLibrary: () => void;
  onShowSettings: () => void;
  onBackToLibrary: () => void;
}) {
  const serverName = profile?.serverName ?? null;
  const username = profile?.verifiedUser?.username ?? null;

  return (
    <header className="appHeader">
      <div className="appHeaderLeft">
        <div className="appBrand">Second Pass Reader</div>
        <div className="appHeaderMeta muted">
          {serverName ? <span>{serverName}</span> : null}
          {serverName && username ? <span className="sep">·</span> : null}
          {username ? <span className="mono">{username}</span> : null}
        </div>
      </div>

      <nav className="appHeaderNav">
        {readerOpen ? (
          <button type="button" className="button buttonCompact" onClick={onBackToLibrary}>
            Back to Library
          </button>
        ) : null}
        {profile?.verifiedAt && view === "settings" ? (
          <button type="button" className="button buttonCompact" onClick={onShowLibrary}>
            Library
          </button>
        ) : null}
        <button type="button" className="button buttonCompact" onClick={onShowSettings}>
          Settings
        </button>
      </nav>
    </header>
  );
}

