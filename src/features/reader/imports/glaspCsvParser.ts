import { normalizeImportedHighlightColor } from "./readerImportColors";
import type { ParsedReaderImport, ReaderImportRow } from "./readerImportTypes";

const HIGHLIGHT_TEXT_COLUMNS = ["highlight text", "highlight", "text"];

export function parseGlaspCsv(text: string): ParsedReaderImport {
  const records = parseCsvRecords(text);
  const warnings: string[] = [];
  if (records.length === 0) return { rows: [], warnings: ["The CSV file was empty."] };

  const headers = records[0].map(normalizeHeader);
  const textIndex = findColumn(headers, HIGHLIGHT_TEXT_COLUMNS);
  if (textIndex < 0) throw new Error("Glasp CSV is missing a Highlight Text column.");

  const noteIndex = findColumn(headers, ["note", "notes"]);
  const colorIndex = findColumn(headers, ["color", "highlight color"]);
  const locationIndex = findColumn(headers, ["location", "loc"]);
  const rows: ReaderImportRow[] = [];
  let skippedBlankRows = 0;

  records.slice(1).forEach((record, rowOffset) => {
    const importedText = cell(record, textIndex);
    if (!importedText) {
      skippedBlankRows += 1;
      return;
    }
    const importedColor = cell(record, colorIndex);
    const importedNote = cell(record, noteIndex);
    const importedLocation = cell(record, locationIndex);
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

function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cellText = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cellText += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cellText += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cellText.trim());
      cellText = "";
    } else if (ch === "\n") {
      row.push(cellText.trim());
      rows.push(row);
      row = [];
      cellText = "";
    } else if (ch !== "\r") {
      cellText += ch;
    }
  }

  row.push(cellText.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.includes(header));
}

function cell(record: string[], index: number): string {
  if (index < 0) return "";
  return (record[index] ?? "").trim();
}
