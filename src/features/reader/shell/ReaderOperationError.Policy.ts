export type ReaderOperationFailureKind =
  | "initialization"
  | "display"
  | "navigation"
  | "search-result"
  | "reflow";

export type ReaderOperationErrorSeverity = "fatal" | "recoverable";

export function classifyReaderOperationError(
  kind: ReaderOperationFailureKind,
  hasReadableViewport: boolean,
): ReaderOperationErrorSeverity {
  if (kind === "initialization") return "fatal";
  if (kind === "display" && !hasReadableViewport) return "fatal";
  return "recoverable";
}
