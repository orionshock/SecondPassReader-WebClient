import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isAuthenticationRepairError, isAuthorizationError } from "./AppUserFacingErrors.Mapper";

type ConnectionRecoveryContextValue = {
  authorizationFailure: boolean;
  authenticationRepairRequired: boolean;
  routeRecoveryState: "idle" | "trying" | "unavailable";
  setRouteRecoveryState: (state: "idle" | "trying" | "unavailable") => void;
  reportAuthorizationFailure: (error: unknown) => void;
  requireAuthenticationRepair: () => void;
  clearAuthorizationFailure: () => void;
};

const DEFAULT_VALUE: ConnectionRecoveryContextValue = {
  authorizationFailure: false,
  authenticationRepairRequired: false,
  routeRecoveryState: "idle",
  setRouteRecoveryState: () => undefined,
  reportAuthorizationFailure: () => undefined,
  requireAuthenticationRepair: () => undefined,
  clearAuthorizationFailure: () => undefined,
};

const ConnectionRecoveryContext = createContext<ConnectionRecoveryContextValue>(DEFAULT_VALUE);

export function reduceAuthorizationFailure(current: boolean, error: unknown): boolean {
  return current || isAuthorizationError(error);
}

export function reduceAuthenticationRepairRequired(current: boolean, error: unknown): boolean {
  return current || isAuthenticationRepairError(error);
}

export function ConnectionRecoveryProvider({ children }: { children: ReactNode }) {
  const [authorizationFailure, setAuthorizationFailure] = useState(false);
  const [authenticationRepairRequired, setAuthenticationRepairRequired] = useState(false);
  const [routeRecoveryState, setRouteRecoveryState] = useState<"idle" | "trying" | "unavailable">("idle");

  const reportAuthorizationFailure = useCallback((error: unknown) => {
    setAuthorizationFailure((current) => reduceAuthorizationFailure(current, error));
    setAuthenticationRepairRequired((current) => reduceAuthenticationRepairRequired(current, error));
  }, []);

  const clearAuthorizationFailure = useCallback(() => {
    setAuthorizationFailure(false);
    setAuthenticationRepairRequired(false);
  }, []);

  const requireAuthenticationRepair = useCallback(() => {
    setAuthorizationFailure(true);
    setAuthenticationRepairRequired(true);
  }, []);

  const value = useMemo(() => ({
    authorizationFailure,
    authenticationRepairRequired,
    routeRecoveryState,
    setRouteRecoveryState,
    reportAuthorizationFailure,
    requireAuthenticationRepair,
    clearAuthorizationFailure,
  }), [authenticationRepairRequired, authorizationFailure, clearAuthorizationFailure, reportAuthorizationFailure, requireAuthenticationRepair, routeRecoveryState]);

  return <ConnectionRecoveryContext.Provider value={value}>{children}</ConnectionRecoveryContext.Provider>;
}

export function useConnectionRecovery(): ConnectionRecoveryContextValue {
  return useContext(ConnectionRecoveryContext);
}
