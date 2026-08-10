import type { OpenedBook } from "./Reader.Types";

export function resolveReaderOpenCompletion(opened: OpenedBook, isCurrent: boolean): OpenedBook | null {
  if (isCurrent) return opened;
  releaseOpenedBook(opened);
  return null;
}

export function releaseOpenedBook(opened: OpenedBook | null): void {
  if (opened) URL.revokeObjectURL(opened.objectUrl);
}
