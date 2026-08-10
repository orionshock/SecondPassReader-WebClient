import type { ReaderViewportStatus } from "./Reader.Viewport";

export type ReaderReadinessState =
  | "empty"
  | "loading-engine"
  | "engine-attached"
  | "ready"
  | "error";

export function isReaderFullyReady(state: ReaderReadinessState): boolean {
  return state === "ready";
}

export function toReaderViewportStatus(state: ReaderReadinessState): ReaderViewportStatus {
  if (state === "loading-engine" || state === "engine-attached") return "loading";
  return state;
}
