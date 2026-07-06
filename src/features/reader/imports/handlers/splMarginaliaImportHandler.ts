import {
  formatMarginaliaSessionLabel,
  parseAndSplitMarginaliaExport,
} from "../../../settings/marginaliaSplitExport";
import { normalizeImportedHighlightColor } from "../readerImportColors";
import { ReaderImportParseError, registerReaderImportHandler } from "../readerImportFormats";
import type { ReaderImportJob, ReaderImportRow } from "../readerImportTypes";

const SPL_EXPORT_SPLITTER_ROUTE = "#/settings?tab=tools";

class SplMarginaliaSessionCountError extends Error {
  readonly sessionCount: number;

  constructor(sessionCount: number) {
    super(
      sessionCount === 0
        ? "This export does not contain any sessions to import."
        : `This export contains ${sessionCount} sessions. Reader import works with one session at a time.`,
    );
    this.name = "SplMarginaliaSessionCountError";
    this.sessionCount = sessionCount;
  }
}

export const splMarginaliaImportHandler = {
  kind: "spl-session-json" as const,
  displayName: "SPL Marginalia",
  description: "Import a One Session File in SPL Marginalia Format",
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
                  label: "Open export splitter",
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
      readOnly: true,
      summaryDisplay: {
        eyebrow: "Session",
        title: sessionLabel || fileName,
        metadata: [{ label: "Annotations", value: String(annotations.length) }],
      },
      sourceBook: item.book,
      sourceSession: item.session,
    },
  };
}

function toImportRow(annotation: Record<string, unknown>, index: number): ReaderImportRow {
  const quote = readQuote(annotation);
  const text = getString(annotation.highlight_text) ?? quote ?? getString(annotation.text) ?? "(No highlight text)";
  const note = getString(annotation.comment_text) ?? getString(annotation.note) ?? getString(annotation.comment);
  const color = readColor(annotation);
  const location = readLocationHint(annotation);

  return {
    id: getString(annotation.id) ?? `annotation-${index}`,
    index,
    importedText: text,
    importedNote: note,
    importedColor: color,
    normalizedColor: normalizeImportedHighlightColor(color),
    importedLocation: location,
    status: "staged",
    rawAnnotation: annotation,
  };
}

function readColor(annotation: Record<string, unknown>): string | undefined {
  const body = annotation.body;
  const bodies = Array.isArray(body) ? body : [body];
  for (const item of bodies) {
    if (!isRecord(item)) continue;
    const color = getString(item.color);
    if (color) return color;
  }
  return undefined;
}

function readAnnotations(session: Record<string, unknown>): Record<string, unknown>[] {
  const value = Array.isArray(session.items) && !Array.isArray(session.annotations) ? session.items : session.annotations;
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readQuote(annotation: Record<string, unknown>): string | undefined {
  const quote = annotation.quote;
  if (isRecord(quote)) return getString(quote.exact);

  const target = annotation.target;
  if (!isRecord(target)) return undefined;
  const selector = target.selector;
  const selectors = Array.isArray(selector) ? selector : [selector];
  for (const item of selectors) {
    if (isRecord(item) && getString(item.type) === "TextQuoteSelector") return getString(item.exact) ?? undefined;
  }
  return undefined;
}

function readLocationHint(annotation: Record<string, unknown>): string | undefined {
  const selector = annotation.selector ?? (isRecord(annotation.target) ? annotation.target.selector : undefined);
  const selectors = Array.isArray(selector) ? selector : [selector];
  for (const item of selectors) {
    if (!isRecord(item)) continue;
    const kind = getString(item.kind) ?? getString(item.type);
    const value = getString(item.value);
    if (value && (kind === "epub_cfi" || kind === "FragmentSelector")) return `Location hint: ${value}`;
  }
  return undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
