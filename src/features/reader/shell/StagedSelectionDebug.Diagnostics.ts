const STAGED_SELECTION_DEBUG_KEY = "secondpass.debug.stagedSelection";
const IMPORT_DEBUG_KEY = "secondpass.debug.imports";

export function debugStagedSelection(event: string, data?: Record<string, unknown>): void {
  if (!isStagedSelectionDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.debug(`[SPR staged] ${event}`, data);
}

export function previewStagedSelectionCfi(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return "";
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 180)}...`;
}

function isStagedSelectionDebugEnabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage?.getItem(STAGED_SELECTION_DEBUG_KEY) === "1"
      || window.localStorage?.getItem(IMPORT_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}
