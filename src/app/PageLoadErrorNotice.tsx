import { useEffect } from "react";
import { useConnectionRecovery } from "./ConnectionRecoveryContext";
import { isAuthorizationError } from "./userFacingErrors";

export function PageLoadErrorNotice({
  error,
  message,
  onRetry,
  retryDisabled = false,
  className = "errorText",
}: {
  error: unknown;
  message: string;
  onRetry?: () => void;
  retryDisabled?: boolean;
  className?: string;
}) {
  const { reportAuthorizationFailure } = useConnectionRecovery();

  useEffect(() => {
    reportAuthorizationFailure(error);
  }, [error, reportAuthorizationFailure]);

  return (
    <div className={className}>
      {message}{" "}
      {onRetry ? (
        <button type="button" className="button buttonCompact" onClick={onRetry} disabled={retryDisabled}>
          Retry
        </button>
      ) : null}{" "}
      {isAuthorizationError(error) ? (
        <a className="button buttonCompact" href="#/settings?tab=library-server">
          Manage connection
        </a>
      ) : null}
    </div>
  );
}
