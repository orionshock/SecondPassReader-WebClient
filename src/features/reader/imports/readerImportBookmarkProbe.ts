import type { ReaderCfiDisplayResult, ReaderCfiProbeResult } from "../domain/types";
import type { ReaderDisplayCfiHandle, ReaderProbeCfiHandle } from "../shell/types";
import type { ReaderImportRowStatus } from "./readerImportTypes";
import { debugReaderImport, previewImportText } from "./readerImportDebug";

export type ReaderImportBookmarkProbeOutcome = {
  status: Extract<ReaderImportRowStatus, "staged" | "not-found">;
  result: ReaderCfiProbeResult | ReaderCfiDisplayResult;
};

export async function probeReaderImportBookmarkCfi({
  cfiHint,
  probeCfi,
  displayCfi,
  rowId,
}: {
  cfiHint?: string;
  probeCfi: ReaderProbeCfiHandle | null;
  displayCfi: ReaderDisplayCfiHandle | null;
  rowId?: string;
}): Promise<ReaderImportBookmarkProbeOutcome> {
  const cfi = cfiHint?.trim() ?? "";
  if (!cfi) return { status: "not-found", result: { ok: false, code: "invalid", error: "Bookmark row has no CFI hint." } };
  if (!probeCfi) return { status: "not-found", result: { ok: false, code: "unsupported", error: "CFI probe is unavailable." } };

  debugReaderImport("bookmark CFI probe start", { rowId, cfiPreview: previewImportText(cfi) });
  let result: ReaderCfiProbeResult;
  try {
    result = await probeCfi(cfi);
  } catch (error) {
    const failure: ReaderCfiProbeResult = {
      ok: false,
      code: "resolution-failed",
      error: error instanceof Error ? error.message : "CFI probe failed.",
    };
    debugReaderImport("bookmark CFI probe failed", { rowId, code: failure.code, reason: failure.error });
    return { status: "not-found", result: failure };
  }
  if (!result.ok) {
    debugReaderImport("bookmark CFI probe failed", { rowId, code: result.code, reason: result.error });
    return { status: "not-found", result };
  }
  debugReaderImport("bookmark CFI probe success", { rowId, code: result.code, description: result.description });
  if (!displayCfi) return { status: "not-found", result: { ok: false, code: "unsupported", error: "Safe CFI display is unavailable." } };

  debugReaderImport("bookmark CFI display start", { rowId, cfiPreview: previewImportText(cfi) });
  try {
    const displayResult = await displayCfi(cfi, { navigationIntent: "import-staging" });
    if (displayResult.ok) {
      debugReaderImport("bookmark CFI display success", {
        rowId,
        code: displayResult.code,
        verification: displayResult.code === "displayed" ? "exact" : "approximate",
      });
    } else {
      debugReaderImport("bookmark CFI display failure", { rowId, code: displayResult.code, reason: displayResult.error });
    }
    return { status: displayResult.ok ? "staged" : "not-found", result: displayResult };
  } catch (error) {
    const failure: ReaderCfiDisplayResult = {
      ok: false,
      code: "display-failed",
      error: error instanceof Error ? error.message : "CFI display failed.",
    };
    debugReaderImport("bookmark CFI display failure", { rowId, code: failure.code, reason: failure.error });
    return { status: "not-found", result: failure };
  }
}
