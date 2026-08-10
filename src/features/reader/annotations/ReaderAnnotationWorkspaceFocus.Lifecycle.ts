import { useEffect } from "react";
import type { RefObject } from "react";
import type { AnnotationWorkspaceTabKey } from "./AnnotationWorkspace.Tabs";

export type AnnotationWorkspaceFocusRequest = {
  annotationId: string;
  mode: "editable" | "readonly";
  seq: number;
};

export function useAnnotationWorkspaceFocus({
  focusRequest,
  rootRef,
  setTab,
}: {
  focusRequest?: AnnotationWorkspaceFocusRequest | null;
  rootRef: RefObject<HTMLElement | null>;
  setTab: (tab: AnnotationWorkspaceTabKey) => void;
}) {
  useEffect(() => {
    if (!focusRequest?.annotationId) return;
    setTab(focusRequest.mode === "readonly" ? "previous" : "current");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const root = rootRef.current;
        if (!root) return;
        const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-annotation-id]"));
        const card = cards.find((item) => item.dataset.annotationId === focusRequest.annotationId);
        card?.scrollIntoView({ behavior: "smooth", block: "center" });
        card?.focus({ preventScroll: true });
      });
    });
  }, [focusRequest, rootRef, setTab]);
}
