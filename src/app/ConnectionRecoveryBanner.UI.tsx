import type { AppRoute } from "./AppNavigation.Router";

export function shouldShowConnectionRecoveryBanner(input: {
  authorizationFailure: boolean;
  routeRecoveryState?: "idle" | "trying" | "unavailable";
  hasConnection: boolean;
  route: AppRoute | null;
}): boolean {
  if ((!input.authorizationFailure && (!input.routeRecoveryState || input.routeRecoveryState === "idle")) || !input.hasConnection) return false;
  if (input.route?.kind === "connect" || input.route?.kind === "pair" || input.route?.kind === "verify") {
    return false;
  }
  return !(input.route?.kind === "settings" && input.route.tab === "library-server");
}

export function ConnectionRecoveryBanner({
  repairRequired = false,
  routeRecoveryState = "idle",
}: {
  repairRequired?: boolean;
  routeRecoveryState?: "idle" | "trying" | "unavailable";
}) {
  const routeRecoveryVisible = !repairRequired && routeRecoveryState !== "idle";
  return (
    <section className="connectionRecoveryBanner" role="status" aria-labelledby="connection-recovery-title">
      <div className="connectionRecoveryCopy">
        <h2 id="connection-recovery-title" className="connectionRecoveryTitle">
          {routeRecoveryVisible
            ? routeRecoveryState === "trying" ? "Trying another Library URL" : "Library connection unavailable"
            : repairRequired
            ? "This connection needs repair"
            : "This account can't access this item"}
        </h2>
        <p className="connectionRecoveryDescription">
          {routeRecoveryVisible
            ? routeRecoveryState === "trying"
              ? "Checking the Library's saved URLs. Your offline data is unchanged."
              : "No saved Library URL could be verified. Your offline data is still available."
            : repairRequired
            ? "Sign in again to restore access. Offline data is kept only if the connection verifies the same account."
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
  routeRecoveryState?: "idle" | "trying" | "unavailable";
  hasConnection: boolean;
  route: AppRoute | null;
}) {
  return shouldShowConnectionRecoveryBanner(input)
    ? <ConnectionRecoveryBanner repairRequired={input.authenticationRepairRequired} routeRecoveryState={input.routeRecoveryState} />
    : null;
}
