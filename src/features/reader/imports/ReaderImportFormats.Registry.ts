import type { ReaderImportJob } from "./ReaderImport.Types";

export type ReaderImportFailureAction = {
  label: string;
  href: string;
};

export class ReaderImportParseError extends Error {
  readonly code?: string;
  readonly detail?: unknown;
  readonly action?: ReaderImportFailureAction;

  constructor(message: string, options?: { code?: string; detail?: unknown; action?: ReaderImportFailureAction }) {
    super(message);
    this.name = "ReaderImportParseError";
    this.code = options?.code;
    this.detail = options?.detail;
    this.action = options?.action;
  }
}

export type ReaderImportFormatHandler = {
  kind: string;
  displayName: string;
  description: string;
  accept: string;
  importFile: (file: File) => Promise<ReaderImportJob>;
};

const readerImportHandlers = new Map<string, ReaderImportFormatHandler>();

export function registerReaderImportHandler(handler: ReaderImportFormatHandler): void {
  readerImportHandlers.set(handler.kind, handler);
}

export function getReaderImportHandlers(): ReaderImportFormatHandler[] {
  return Array.from(readerImportHandlers.values());
}

export function getReaderImportFormat(kind: string): ReaderImportFormatHandler {
  const format = readerImportHandlers.get(kind);
  if (!format) throw new ReaderImportParseError(`Unsupported import format: ${kind}.`, { code: "unsupported-format" });
  return format;
}
