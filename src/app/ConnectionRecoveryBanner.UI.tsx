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

export function ConnectionRecoveryBanner({ repairRequired = false }: { repairRequired?: boolean }) {
  return (
    <section className="connectionRecoveryBanner" role="status" aria-labelledby="connection-recovery-title">
      <div className="connectionRecoveryCopy">
        <h2 id="connection-recovery-title" className="connectionRecoveryTitle">
          {repairRequired
            ? "This connection needs repair"
            : "This account can't access this item"}
        </h2>
        <p className="connectionRecoveryDescription">
          {repairRequired
            ? "Sign in again to restore access. Offline reading data remains saved."
            : "Check the connection or try again after access is restored."}
        </p>
      </div>
      <a className="button buttonPrimary buttonCompact" href="#/settings?tab=library-server">
        {repairRequired ? "Repair connection" : "View connection"}
      </a>
    </section>
  );
}

export function ConnectionRecoveryBannerForState(input: {
  authorizationFailure: boolean;
  authenticationRepairRequired?: boolean;
  hasConnection: boolean;
  route: AppRoute | null;
}) {
  return shouldShowConnectionRecoveryBanner(input)
    ? <ConnectionRecoveryBanner repairRequired={input.authenticationRepairRequired} />
    : null;
}
