import { PageLoadErrorNotice } from "../../app/AppPageLoadError.Notice";
import { getAuthRecoveryMessage, getPageLoadErrorMessage } from "../../app/AppUserFacingErrors.Mapper";

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
