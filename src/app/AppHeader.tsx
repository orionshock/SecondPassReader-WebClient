import type { ConnectionProfile } from "../storage/connectionProfiles";
import type { AppRoute } from "./navigation";

export function AppHeader({
  profile,
  view,
  route,
  canNavigate,
  onShowHome,
  onShowLibrary,
  onShowShelves,
  onShowSettings,
}: {
  profile: ConnectionProfile | null;
  view: "main" | "settings";
  route: AppRoute | null;
  canNavigate: boolean;
  onShowHome: () => void;
  onShowLibrary: () => void;
  onShowShelves: () => void;
  onShowSettings: () => void;
}) {
  const serverName = profile?.serverName ?? null;
  const username = profile?.verifiedUser?.username ?? null;

  const pageLabel =
    route?.kind === "home"
      ? "Home"
      : route?.kind === "library"
        ? "Library"
        : route?.kind === "shelves"
          ? "Shelves"
          : view === "settings"
            ? "Settings"
            : null;

  return (
    <header className="appHeader">
      <div className="appHeaderLeft">
        <div className="appBrand">Second Pass Reader</div>
        {pageLabel ? <div className="muted">{pageLabel}</div> : null}
        <div className="appHeaderMeta muted">
          {serverName ? <span>{serverName}</span> : null}
          {serverName && username ? <span className="sep">·</span> : null}
          {username ? <span className="mono">{username}</span> : null}
        </div>
      </div>

      <nav className="appHeaderNav">
        {canNavigate ? (
          <>
            <button type="button" className="button buttonCompact" onClick={onShowHome}>
              Home
            </button>
            <button type="button" className="button buttonCompact" onClick={onShowLibrary}>
              Library
            </button>
            <button type="button" className="button buttonCompact" onClick={onShowShelves}>
              Shelves
            </button>
            <button
              type="button"
              className="button buttonCompact"
              onClick={onShowSettings}
              title="Settings"
              aria-label="Settings"
            >
              ⚙
            </button>
          </>
        ) : null}
      </nav>
    </header>
  );
}

