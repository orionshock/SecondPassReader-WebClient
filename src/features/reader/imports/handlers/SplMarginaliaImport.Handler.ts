import {
  formatMarginaliaSessionLabel,
  parseAndSplitMarginaliaExport,
} from "../../../settings/MarginaliaSplitExport.Actions";
import { ReaderImportParseError, registerReaderImportHandler } from "../ReaderImportFormats.Registry";
import type { ReaderImportJob, ReaderImportRow } from "../ReaderImport.Types";

const SPL_EXPORT_SPLITTER_ROUTE = "#/settings?tab=tools";

class SplMarginaliaSessionCountError extends Error {
  readonly sessionCount: number;

  constructor(sessionCount: number) {
    super(
      sessionCount === 0
        ? "This export contains no Reading Sessions to import."
        : `This export contains ${sessionCount} Reading Sessions. Split it first, then import one Reading Session file.`,
    );
    this.name = "SplMarginaliaSessionCountError";
    this.sessionCount = sessionCount;
  }
}

export const splMarginaliaImportHandler = {
  kind: "spl-session-json" as const,
  displayName: "Second Pass Marginalia",
  description: "Import one Reading Session from a Second Pass Marginalia JSON file.",
  accept: "application/json,.json",
  importFile: async (file: File) => {
    try {
      return parseSplMarginaliaSessionImport(await file.text(), file.name).job;
    } catch (error) {
      if (error instanceof SplMarginaliaSessionCountError) {
        throw new ReaderImportParseError(error.message, {
          code: error.sessionCount === 0 ? "spl-session-empty" : "spl-session-multiple",
          detail: { sessionCount: error.sessionCount },
          action:
            error.sessionCount > 1
              ? {
                  label: "Split export",
                  href: SPL_EXPORT_SPLITTER_ROUTE,
                }
              : undefined,
        });
      }
      throw error;
    }
  },
};

registerReaderImportHandler(splMarginaliaImportHandler);

function parseSplMarginaliaSessionImport(text: string, fileName: string, now = new Date()): { job: ReaderImportJob } {
  const split = parseAndSplitMarginaliaExport(text);
  if (split.items.length !== 1) throw new SplMarginaliaSessionCountError(split.items.length);

  const item = split.items[0]!;
  const annotations = readAnnotations(item.session);
  const rows = annotations.map((annotation, index) => toImportRow(annotation, index + 1));
  const sessionLabel = formatMarginaliaSessionLabel(item.session);

  return {
    job: {
      id: `spl-session-${now.getTime()}`,
      format: "spl-session-json",
      fileName,
      createdAt: now.toISOString(),
      rows,
      activeRowId: rows[0]?.id,
      summaryDisplay: sessionLabel || fileName,
    },
  };
}

function toImportRow(annotation: Record<string, unknown>, index: number): ReaderImportRow {
  const kind = getString(annotation.kind) === "bookmark" ? "bookmark" : "highlight";
  const body = isRecord(annotation.body) ? annotation.body : undefined;
  const cfiHint = readCfiHint(annotation);
  const quoteText = kind === "bookmark" ? undefined : getString(body?.text);
  const noteText = getString(body?.note);
  const color = getString(body?.color);

  return {
    id: getString(annotation.clientAnnotationId) ?? `annotation-${index}`,
    kind,
    index,
    quoteText,
    preQuoteText: getString(body?.prefix),
    postQuoteText: getString(body?.suffix),
    cfiHint,
    noteText,
    color,
    status: "pending",
  };
}

function readAnnotations(session: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(session.annotations) ? session.annotations.filter(isRecord) : [];
}

function readCfiHint(annotation: Record<string, unknown>): string | undefined {
  return isRecord(annotation.location) ? getString(annotation.location.location) : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
