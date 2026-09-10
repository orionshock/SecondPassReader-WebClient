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
            ? "This saved connection needs to be repaired."
            : "This device cannot access this library resource."}
        </h2>
        <p className="connectionRecoveryDescription">
          {repairRequired
            ? "Sign in again to keep using this library. Offline reading data remains stored."
            : "Manage the connection or try again after access is restored."}
        </p>
      </div>
      <a className="button buttonPrimary buttonCompact" href="#/settings?tab=library-server">
        {repairRequired ? "Repair connection" : "Manage connection"}
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
