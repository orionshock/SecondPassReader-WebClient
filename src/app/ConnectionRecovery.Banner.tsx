import type { AppRoute } from "./AppNavigation.Router";

export function shouldShowConnectionRecoveryBanner(input: {
  authorizationFailure: boolean;
  hasConnection: boolean;
  route: AppRoute | null;
}): boolean {
  if (!input.authorizationFailure || !input.hasConnection) return false;
  if (input.route?.kind === "connect" || input.route?.kind === "pair" || input.route?.kind === "verify") {
    return false;
  }
  return !(input.route?.kind === "settings" && input.route.tab === "library-server");
}

export function ConnectionRecoveryBanner() {
  return (
    <section className="connectionRecoveryBanner" role="status" aria-labelledby="connection-recovery-title">
      <div className="connectionRecoveryCopy">
        <h2 id="connection-recovery-title" className="connectionRecoveryTitle">
          This device is no longer authorized by the library server.
        </h2>
        <p className="connectionRecoveryDescription">
          Manage the connection to log out, forget this device, or pair again.
        </p>
      </div>
      <a className="button buttonPrimary buttonCompact" href="#/settings?tab=library-server">
        Manage connection
      </a>
    </section>
  );
}

export function ConnectionRecoveryBannerForState(input: {
  authorizationFailure: boolean;
  hasConnection: boolean;
  route: AppRoute | null;
}) {
  return shouldShowConnectionRecoveryBanner(input) ? <ConnectionRecoveryBanner /> : null;
}
