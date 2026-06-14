import type { ReadingSessionOrchestratorProps } from "../session/ReadingSessionOrchestrator";

export type ReaderActivityRenderState = Parameters<ReadingSessionOrchestratorProps["children"]>[0];

export type ReaderActivityWorkspaceFocusRequest = {
  annotationId: string;
  mode: "editable" | "readonly";
  seq: number;
};
