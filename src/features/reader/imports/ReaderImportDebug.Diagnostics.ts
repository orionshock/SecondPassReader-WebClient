import {
  debugLog,
  isImportDebugVerbose,
} from "../../../lib/debug/DebugLogger.Diagnostics";

const DEFAULT_PREVIEW_LENGTH = 120;

/**
 * Enable import diagnostics from DevTools:
 * localStorage.setItem("secondpass.debug.logs", "imports")
 *
 * Enable full text previews only when needed:
 * localStorage.setItem("secondpass.debug.logs.imports.verbose", "1")
 */
export function debugReaderImport(event: string, data?: Record<string, unknown>): void {
  debugLog("imports", event, data);
}

export function isReaderImportDebugVerbose(): boolean {
  return isImportDebugVerbose();
}

export function previewImportText(
  value: unknown,
  maxLength = DEFAULT_PREVIEW_LENGTH,
  verbose = isReaderImportDebugVerbose(),
): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (verbose || compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}
