import type { ConnectionProfile } from "../storage/ConnectionProfiles.Store";
import type { AppRoute } from "./AppNavigation.Router";
import { MaterialIcon } from "../components/MaterialIcon.UI";
import { MetaSeparator } from "../components/Metadata.UI";
import type { BrowserConnectivityStatus } from "./connectivity/BrowserConnectivity.State";

export function AppHeader({
  profile,
  view,
  route,
  canNavigate,
  connectivity,
  onShowHome,
  onShowLibrary,
  onShowSessions,
  onShowShelves,
  onShowSettings,
}: {
  profile: ConnectionProfile | null;
  view: "main" | "settings";
  route: AppRoute | null;
  canNavigate: boolean;
  connectivity: BrowserConnectivityStatus;
  onShowHome: () => void;
  onShowLibrary: () => void;
  onShowSessions: () => void;
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
        : route?.kind === "sessions" || route?.kind === "session"
          ? "Session Management"
        : route?.kind === "shelves" || route?.kind === "shelf"
          ? "Shelves"
          : view === "settings"
            ? "Settings"
            : null;

  const onGoSectionHome = (() => {
    if (!pageLabel) return null;
    if (view === "settings") return onShowSettings;
    switch (route?.kind) {
      case "home":
        return onShowHome;
      case "library":
        return onShowLibrary;
      case "shelves":
      case "shelf":
        return onShowShelves;
      case "sessions":
      case "session":
        return onShowSessions;
      case "settings":
        return onShowSettings;
      default:
        return null;
    }
  })();

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
          <img className="appBrandIcon" src="/favicon.png" alt="" aria-hidden="true" />
          <span>Second Pass Reader</span>
        </button>
        {pageLabel ? (
          <button
            type="button"
            className="appSectionButton muted"
            onClick={onGoSectionHome ?? undefined}
            disabled={!onGoSectionHome}
            aria-label={`Go to ${pageLabel}`}
            title={`Go to ${pageLabel}`}
          >
            {pageLabel}
          </button>
        ) : null}
        <div className="appHeaderMeta muted">
          {connectivity === "offline" ? <span className="pill pillWarn" role="status" aria-live="polite">Offline</span> : null}
          {serverName ? (
            <>
              <MaterialIcon name="local_library" className="appHeaderMetaIcon" ariaHidden />
              <span>{serverName}</span>
            </>
          ) : null}
          {serverName && userLabel ? <MetaSeparator /> : null}
          {userLabel ? <span className="mono">{userLabel}</span> : null}
        </div>
      </div>

      <nav className="appHeaderNav">
        {canNavigate ? (
          <>
            <button
              type="button"
              className="button buttonCompact"
              onClick={onShowHome}
              title="Home"
              aria-label="Home"
            >
              <MaterialIcon name="home" />
            </button>
            <button type="button" className="button buttonCompact" onClick={onShowLibrary}>
              Library
            </button>
            <button type="button" className="button buttonCompact" onClick={onShowShelves}>
              Shelves
            </button>
            <button type="button" className="button buttonCompact" onClick={onShowSessions}>
              Sessions
            </button>
            <button
              type="button"
              className="button buttonCompact"
              onClick={onShowSettings}
              title="Settings"
              aria-label="Settings"
            >
              <MaterialIcon name="settings" />
            </button>
          </>
        ) : null}
      </nav>
    </header>
  );
}
