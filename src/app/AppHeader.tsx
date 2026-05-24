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
  const userLabel = (() => {
    const vu = profile?.verifiedUser;
    if (!vu) return null;
    const first = typeof vu.firstName === "string" ? vu.firstName.trim() : "";
    const last = typeof vu.lastName === "string" ? vu.lastName.trim() : "";
    const username = vu.username ? vu.username.trim() : "";
    if (first && last && username) return `<${first} ${last}>@${username}`;
    if (first && last) return `<${first} ${last}>`;
    if (username) return `@${username}`;
    return null;
  })();

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
        <button
          type="button"
          className="appBrand appBrandButton"
          onClick={onShowHome}
          aria-label="Go to Home"
          title="Home"
        >
          Second Pass Reader
        </button>
        {pageLabel ? <div className="muted">{pageLabel}</div> : null}
        <div className="appHeaderMeta muted">
          {serverName ? (
            <>
              <span aria-hidden="true">{"\u{1F4DA}"}</span>
              <span>{serverName}</span>
            </>
          ) : null}
          {serverName && userLabel ? <span className="sep">·</span> : null}
          {userLabel ? <span className="mono">{userLabel}</span> : null}
        </div>
      </div>

      <nav className="appHeaderNav">
        {canNavigate ? (
          <>
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
