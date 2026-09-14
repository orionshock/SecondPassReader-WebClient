import { useEffect, useState } from "react";
import { debugLog } from "../lib/debug/DebugLogger.Diagnostics";
import type { AppRoute } from "./AppNavigation.Router";
import { navigateTo, parseCurrentRoute, routeToHash } from "./AppNavigation.Router";
import type { AppWorkflowStep } from "./AppWorkflow.Policy";

export function resolveAppRouteForWorkflow(
  route: AppRoute | null,
  workflowStep: AppWorkflowStep,
): AppRoute | null {
  switch (workflowStep) {
    case "connect_server":
      return route?.kind === "connect" ? null : { kind: "connect" };
    case "pair_device":
      return route?.kind === "pair" ? null : { kind: "pair" };
    case "verify_connection":
      return route?.kind === "verify" ? null : { kind: "verify" };
    case "library_home":
      if (!route || route.kind === "unknown") return { kind: "home" };
      if (route.kind === "connect" || route.kind === "pair" || route.kind === "verify") {
        return { kind: "home" };
      }
      return null;
  }
}

export function useAppRouteWorkflowLifecycle(workflowStep: AppWorkflowStep): AppRoute | null {
  const [route, setRoute] = useState<AppRoute | null>(() => parseCurrentRoute());

  useEffect(() => {
    const handleHashChange = () => setRoute(parseCurrentRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    debugLog("reader", "route changed", {
      kind: route?.kind ?? null,
      bookId: route?.kind === "reader" ? route.bookId : undefined,
    });
  }, [route]);

  useEffect(() => {
    const replacement = resolveAppRouteForWorkflow(route, workflowStep);
    if (replacement && window.location.hash !== routeToHash(replacement)) {
      navigateTo(replacement, { replace: true });
    }
  }, [route, workflowStep]);

  return route;
}
