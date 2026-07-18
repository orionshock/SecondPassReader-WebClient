import type { ReaderCfiDisplayResult, ReaderCfiProbeResult } from "../domain/types";
import type { ReaderDisplayCfiHandle, ReaderProbeCfiHandle } from "../shell/types";
import type { ReaderImportRowStatus } from "./readerImportTypes";

export type ReaderImportBookmarkProbeOutcome = {
  status: Extract<ReaderImportRowStatus, "staged" | "not-found">;
  result: ReaderCfiProbeResult | ReaderCfiDisplayResult;
};

export async function probeReaderImportBookmarkCfi({
  cfiHint,
  probeCfi,
  displayCfi,
}: {
  cfiHint?: string;
  probeCfi: ReaderProbeCfiHandle | null;
  displayCfi: ReaderDisplayCfiHandle | null;
}): Promise<ReaderImportBookmarkProbeOutcome> {
  const cfi = cfiHint?.trim() ?? "";
  if (!cfi) return { status: "not-found", result: { ok: false, code: "invalid", error: "Bookmark row has no CFI hint." } };
  if (!probeCfi) return { status: "not-found", result: { ok: false, code: "unsupported", error: "CFI probe is unavailable." } };

  try {
    const result = await probeCfi(cfi);
    if (!result.ok) return { status: "not-found", result };
    if (!displayCfi) return { status: "not-found", result: { ok: false, code: "unsupported", error: "Safe CFI display is unavailable." } };
    const displayResult = await displayCfi(cfi);
    return { status: displayResult.ok ? "staged" : "not-found", result: displayResult };
  } catch (error) {
    return {
      status: "not-found",
      result: { ok: false, code: "resolution-failed", error: error instanceof Error ? error.message : "CFI probe failed." },
    };
  }
}
