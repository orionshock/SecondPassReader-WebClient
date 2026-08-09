import type { ReaderRangeRepairDiagnostic } from "../domain/ReaderRangeRepair.Diagnostics";
import { debugReaderImport, isReaderImportDebugVerbose, previewImportText } from "./readerImportDebug";

export function toReaderImportRangeRepairDebugData(
  diagnostic: ReaderRangeRepairDiagnostic,
  verbose: boolean,
): Record<string, unknown> | undefined {
  const data = { ...diagnostic.data };
  for (const preview of diagnostic.previews ?? []) {
    if (preview.verboseOnly && !verbose) continue;
    data[preview.key] = previewImportText(preview.value, preview.maxLength, verbose);
  }
  return Object.keys(data).length > 0 ? data : undefined;
}

export function debugReaderRangeRepairDiagnostic(diagnostic: ReaderRangeRepairDiagnostic): void {
  const verbose = isReaderImportDebugVerbose();
  debugReaderImport(diagnostic.event, toReaderImportRangeRepairDebugData(diagnostic, verbose));
}
