import Papa from "papaparse";
import { registerReaderImportHandler } from "../../ReaderImportFormats.Registry";
import type { ReaderImportRow } from "../../ReaderImport.Types";
import { debugReaderImport } from "../../ReaderImportDebug.Diagnostics";
import { decodeHtmlEntities } from "./GlaspHtmlEntities.Adapter";

const HIGHLIGHT_TEXT_COLUMNS = ["highlight text", "highlight", "text"];

type GlaspCsvRecord = Record<string, unknown>;

export const glaspCsvImportHandler = {
  kind: "glasp-csv" as const,
  displayName: "Glasp CSV",
  description: "Import highlights from a Glasp CSV export.",
  accept: ".csv,text/csv",
  importFile: async (file: File) => {
    const parsed = parseGlaspCsv(await file.text());
    return {
      id: `import-${Date.now()}`,
      format: "glasp-csv" as const,
      fileName: file.name,
      createdAt: new Date().toISOString(),
      rows: parsed.rows,
      activeRowId: parsed.rows[0]?.id,
      warnings: parsed.warnings,
      summaryDisplay: file.name,
    };
  },
};

registerReaderImportHandler(glaspCsvImportHandler);

function parseGlaspCsv(text: string): { rows: ReaderImportRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const parsed = Papa.parse<GlaspCsvRecord>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
    transform: (value) => value.trim(),
  });
  if (parsed.errors.length > 0) {
    debugReaderImport("Glasp CSV parser reported warnings", {
      errors: parsed.errors.map((error) => ({
        code: error.code,
        message: error.message,
        row: error.row,
        type: error.type,
      })),
    });
    warnings.push("Some CSV data could not be read correctly. Review the imported items.");
  }

  const fields = parsed.meta.fields ?? [];
  if (fields.length === 0) return { rows: [], warnings: ["This CSV is empty. Choose a Glasp export with highlights."] };

  const textColumn = findColumn(fields, HIGHLIGHT_TEXT_COLUMNS);
  if (!textColumn) throw new Error("This Glasp CSV has no Highlight Text column. Export it again from Glasp and retry.");

  const noteColumn = findColumn(fields, ["note", "notes"]);
  const colorColumn = findColumn(fields, ["color", "highlight color"]);
  const locationColumn = findColumn(fields, ["location", "loc"]);
  const rows: ReaderImportRow[] = [];
  let skippedBlankRows = 0;

  parsed.data.forEach((record, rowOffset) => {
    const quoteText = decodeHtmlEntities(cell(record, textColumn));
    if (!quoteText) {
      skippedBlankRows += 1;
      return;
    }
    const color = cell(record, colorColumn);
    const noteText = decodeHtmlEntities(cell(record, noteColumn));
    const cfiHint = cell(record, locationColumn);
    rows.push({
      id: `glasp-row-${rowOffset + 1}`,
      kind: "highlight",
      index: rows.length + 1,
      quoteText,
      noteText: noteText || undefined,
      color: color || undefined,
      cfiHint: cfiHint || undefined,
      status: "pending",
    });
  });

  if (skippedBlankRows > 0) {
    warnings.push(`${skippedBlankRows} row${skippedBlankRows === 1 ? "" : "s"} without highlight text ${skippedBlankRows === 1 ? "was" : "were"} skipped.`);
  }
  if (rows.length === 0) warnings.push("No highlights were found. Choose a Glasp export that contains highlights.");
  return { rows, warnings };
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumn(headers: string[], candidates: string[]): string | undefined {
  return headers.find((header) => candidates.includes(header));
}

function cell(record: GlaspCsvRecord, column: string | undefined): string {
  if (!column) return "";
  const value = record[column];
  return typeof value === "string" ? value.trim() : "";
}
