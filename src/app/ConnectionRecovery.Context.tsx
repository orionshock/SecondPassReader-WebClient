import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isAuthorizationError } from "./AppUserFacingErrors.Mapper";

type ConnectionRecoveryContextValue = {
  authorizationFailure: boolean;
  reportAuthorizationFailure: (error: unknown) => void;
  clearAuthorizationFailure: () => void;
};

const DEFAULT_VALUE: ConnectionRecoveryContextValue = {
  authorizationFailure: false,
  reportAuthorizationFailure: () => undefined,
  clearAuthorizationFailure: () => undefined,
};

const ConnectionRecoveryContext = createContext<ConnectionRecoveryContextValue>(DEFAULT_VALUE);

export function reduceAuthorizationFailure(current: boolean, error: unknown): boolean {
  return current || isAuthorizationError(error);
}

export function ConnectionRecoveryProvider({ children }: { children: ReactNode }) {
  const [authorizationFailure, setAuthorizationFailure] = useState(false);

  const reportAuthorizationFailure = useCallback((error: unknown) => {
    setAuthorizationFailure((current) => reduceAuthorizationFailure(current, error));
  }, []);

  const clearAuthorizationFailure = useCallback(() => {
    setAuthorizationFailure(false);
  }, []);

  const value = useMemo(() => ({
    authorizationFailure,
    reportAuthorizationFailure,
    clearAuthorizationFailure,
  }), [authorizationFailure, clearAuthorizationFailure, reportAuthorizationFailure]);

  return <ConnectionRecoveryContext.Provider value={value}>{children}</ConnectionRecoveryContext.Provider>;
}

export function useConnectionRecovery(): ConnectionRecoveryContextValue {
  return useContext(ConnectionRecoveryContext);
}
