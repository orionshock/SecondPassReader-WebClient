import { PageLoadErrorNotice } from "../../app/AppPageLoadErrorNotice.UI";
import { getAuthRecoveryMessage, getPageLoadErrorMessage } from "../../app/AppUserFacingErrors.Mapper";

export function LibraryResultsLoadErrorNotice({ error }: { error: unknown }) {
  return (
    <PageLoadErrorNotice
      error={error}
      message={getPageLoadErrorMessage(
        error,
        "Couldn't load Library. Reload the page to try again.",
        getAuthRecoveryMessage("access the library"),
      )}
    />
  );
}
