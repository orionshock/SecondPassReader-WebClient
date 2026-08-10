import type { ReadingSessionOrchestratorProps } from "../session/ReadingSession.Orchestrator";

export type ReaderActivityRenderState = Parameters<ReadingSessionOrchestratorProps["children"]>[0];

export type ReaderActivityWorkspaceFocusRequest = {
  annotationId: string;
  mode: "editable" | "readonly";
  seq: number;
};
