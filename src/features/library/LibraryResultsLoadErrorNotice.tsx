import { PageLoadErrorNotice } from "../../app/PageLoadErrorNotice";
import { getAuthRecoveryMessage, getPageLoadErrorMessage } from "../../app/userFacingErrors";

export function LibraryResultsLoadErrorNotice({ error }: { error: unknown }) {
  return (
    <PageLoadErrorNotice
      error={error}
      message={getPageLoadErrorMessage(
        error,
        "Could not load library results.",
        getAuthRecoveryMessage("access the library"),
      )}
    />
  );
}
