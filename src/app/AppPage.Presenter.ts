import type { AppRoute } from "./AppNavigation.Router";
import type { AppWorkflowStep } from "./AppWorkflow.Policy";

export type AppPagePresentation = {
  view: "main" | "settings";
  title: string;
  focusKey: string;
};

export function presentAppPage(
  route: AppRoute | null,
  workflowStep: AppWorkflowStep,
  readerBookTitle?: string,
): AppPagePresentation {
  const baseTitle = "Second Pass Reader";
  const view = route?.kind === "settings" ? "settings" : "main";
  const identity = route?.kind === "reader"
    ? route.bookId
    : route?.kind === "session"
      ? route.sessionId
      : route?.kind === "shelf" || route?.kind === "shelfEdit"
        ? route.shelfId
        : "";

  return {
    view,
    focusKey: view === "settings" ? "settings" : `${workflowStep}:${route?.kind ?? ""}:${identity}`,
    title: presentDocumentTitle(route, readerBookTitle, baseTitle),
  };
}

function presentDocumentTitle(
  route: AppRoute | null,
  readerBookTitle: string | undefined,
  baseTitle: string,
): string {
  switch (route?.kind) {
    case "home":
      return `${baseTitle} - Home`;
    case "library":
      return `${baseTitle} - Library`;
    case "shelves":
    case "shelf":
      return `${baseTitle} - Shelves`;
    case "shelfEdit":
      return `${baseTitle} - Edit shelf`;
    case "sessions":
    case "session":
      return `${baseTitle} - Reading Sessions`;
    case "settings":
      return `${baseTitle} - Settings`;
    case "reader":
      return readerBookTitle ? `${baseTitle} - ${readerBookTitle}` : `${baseTitle} - Reader`;
    case "connect":
      return `${baseTitle} - Connect`;
    case "pair":
      return `${baseTitle} - Pair`;
    case "verify":
      return `${baseTitle} - Verify`;
    case "unknown":
    case undefined:
      return baseTitle;
  }
}
