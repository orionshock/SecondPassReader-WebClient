import { debugLog } from "../../../lib/debug/DebugLogger.Diagnostics";

export function debugStagedSelection(event: string, data?: Record<string, unknown>): void {
  debugLog("staged-selection", event, data);
}

export function previewStagedSelectionCfi(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return "";
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 180)}...`;
}
