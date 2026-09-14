import type { ReactNode } from "react";
import type { ReaderBookmarkViewModel } from "../annotations/ReaderBookmark.Presenter";
import type { HighlightViewModel } from "../annotations/ReaderAnnotationViewModels.Types";
import type { ReaderRendererCapability } from "../domain/ReaderBridge.Types";
import type { ReaderAnnotation, ReaderLocation, ReaderTocItem } from "../domain/ReaderDomain.Types";
import type { ReadingShellCommandValue } from "../shell/ReaderShell.Types";
import type { CurrentSessionAuthority } from "./CurrentSessionAuthority.Controller";
import type { PreviousSessionAnnotationGroup } from "./previousSession/PreviousSessionViewModels.Presenter";

export type ReadingSessionState = {
  bookId: string | number;
  sessionId: string | null;
  location: ReaderLocation | null;
  toc: ReaderTocItem[] | null;
  annotations: ReaderAnnotation[];
};

export type ReadingSessionRenderState = {
  state: ReadingSessionState;
  presentation: {
    statusLine: string[];
    autosaveStatus: { text: string; title?: string } | null;
  };
  authority: CurrentSessionAuthority;
  administration: {
    writable: boolean;
    currentSessionMeta: { name: string | null; notes: string | null; status: "idle" | "loading" | "ready" | "error"; error: string | null };
    updateCurrentSessionMeta: (update: { name: string; notes: string }) => Promise<void>;
    closeCurrentSession: (input: { name: string; notes: string }) => Promise<void>;
  };
  shell: ReactNode;
  debugPanel: ReactNode | null;
  renderer: {
    ready: boolean;
    capability: ReaderRendererCapability | null;
    sendCommand: (command: ReadingShellCommandValue) => void;
    jumpToResult: (cfi: string) => void;
    jumpToCfi: (cfi: string) => void;
    jumpToCfiRange: (cfiRange: string) => void;
    clearTemporaryHighlight: () => void;
  };
  marginalia: {
    listStatus: "idle" | "loading" | "ready" | "error";
    listError: string | null;
    previousLayers: Array<{ sessionId: string; label: string; labelParts: string[]; highlightCount: number; status: "idle" | "loading" | "ready" | "error"; error?: string }>;
    selectedPreviousSessionIds: string[];
    togglePreviousSession: (sessionId: string) => void;
  };
  annotations: {
    items: Array<ReaderBookmarkViewModel | HighlightViewModel>;
    status: "idle" | "loading" | "ready" | "error";
    error: string | null;
    previousSessionGroups: PreviousSessionAnnotationGroup[];
    enablePreviousSession: (sessionId: string) => void;
  };
};
