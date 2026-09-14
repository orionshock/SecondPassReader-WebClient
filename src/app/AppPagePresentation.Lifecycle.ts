import { useEffect, useRef, type RefObject } from "react";
import type { AppRoute } from "./AppNavigation.Router";
import { presentAppPage, type AppPagePresentation } from "./AppPage.Presenter";
import type { AppWorkflowStep } from "./AppWorkflow.Policy";

export function useAppPagePresentationLifecycle(input: {
  route: AppRoute | null;
  workflowStep: AppWorkflowStep;
  readerBookTitle?: string;
}): AppPagePresentation & { mainRef: RefObject<HTMLElement | null> } {
  const presentation = presentAppPage(input.route, input.workflowStep, input.readerBookTitle);
  const mainRef = useRef<HTMLElement | null>(null);
  const previousFocusKeyRef = useRef(presentation.focusKey);

  useEffect(() => {
    if (previousFocusKeyRef.current === presentation.focusKey) return;
    previousFocusKeyRef.current = presentation.focusKey;
    mainRef.current?.focus();
  }, [presentation.focusKey]);

  useEffect(() => {
    document.title = presentation.title;
  }, [presentation.title]);

  return { ...presentation, mainRef };
}
