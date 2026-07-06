import Papa from "papaparse";
import { normalizeImportedHighlightColor } from "../readerImportColors";
import { registerReaderImportHandler } from "../readerImportFormats";
import type { ReaderImportRow } from "../readerImportTypes";

const HIGHLIGHT_TEXT_COLUMNS = ["highlight text", "highlight", "text"];

type GlaspCsvRecord = Record<string, unknown>;

export const glaspCsvImportHandler = {
  kind: "glasp-csv" as const,
  displayName: "Glasp CSV",
  description: "Stage highlights from a Glasp CSV export.",
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
      summaryDisplay: {
        eyebrow: "Import file",
        title: file.name,
        metadata: [{ label: "Highlights", value: String(parsed.rows.length) }],
      },
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
    warnings.push(...parsed.errors.slice(0, 3).map((error) => `CSV parse warning: ${error.message}.`));
  }

  const fields = parsed.meta.fields ?? [];
  if (fields.length === 0) return { rows: [], warnings: ["The CSV file was empty."] };

  const textColumn = findColumn(fields, HIGHLIGHT_TEXT_COLUMNS);
  if (!textColumn) throw new Error("Glasp CSV is missing a Highlight Text column.");

  const noteColumn = findColumn(fields, ["note", "notes"]);
  const colorColumn = findColumn(fields, ["color", "highlight color"]);
  const locationColumn = findColumn(fields, ["location", "loc"]);
  const rows: ReaderImportRow[] = [];
  let skippedBlankRows = 0;

  parsed.data.forEach((record, rowOffset) => {
    const importedText = cell(record, textColumn);
    if (!importedText) {
      skippedBlankRows += 1;
      return;
    }
    const importedColor = cell(record, colorColumn);
    const importedNote = cell(record, noteColumn);
    const importedLocation = cell(record, locationColumn);
    rows.push({
      id: `glasp-row-${rowOffset + 1}`,
      index: rows.length + 1,
      importedText,
      importedNote: importedNote || undefined,
      importedColor: importedColor || undefined,
      normalizedColor: normalizeImportedHighlightColor(importedColor),
      importedLocation: importedLocation || undefined,
      status: "pending",
    });
  });

  if (skippedBlankRows > 0) {
    warnings.push(`Skipped ${skippedBlankRows} row${skippedBlankRows === 1 ? "" : "s"} without highlight text.`);
  }
  if (rows.length === 0) warnings.push("No highlight rows were found.");
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
