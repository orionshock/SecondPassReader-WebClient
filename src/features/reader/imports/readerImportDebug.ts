export const IMPORT_DEBUG_KEY = "secondpass.debug.imports";
export const IMPORT_DEBUG_VERBOSE_KEY = "secondpass.debug.imports.verbose";
const DEFAULT_PREVIEW_LENGTH = 120;

/**
 * Enable import diagnostics from DevTools:
 * localStorage.setItem("secondpass.debug.imports", "1")
 *
 * Enable full text previews only when needed:
 * localStorage.setItem("secondpass.debug.imports.verbose", "1")
 */
export function debugReaderImport(event: string, data?: Record<string, unknown>): void {
  if (!isReaderImportDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.debug(`[SPR import] ${event}`, data);
}

export function isReaderImportDebugVerbose(): boolean {
  return readDebugFlag(IMPORT_DEBUG_VERBOSE_KEY);
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

function isReaderImportDebugEnabled(): boolean {
  return readDebugFlag(IMPORT_DEBUG_KEY);
}

function readDebugFlag(key: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem(key) === "1";
  } catch {
    return false;
  }
}
