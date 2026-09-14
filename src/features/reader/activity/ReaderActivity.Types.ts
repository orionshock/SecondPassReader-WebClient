import type { ReadingSessionRenderState } from "../session/ReadingSession.Types";

export type ReaderActivityRenderState = ReadingSessionRenderState;

export type ReaderActivityWorkspaceFocusRequest = {
  annotationId: string;
  mode: "editable" | "readonly";
  seq: number;
};
