import type { ReaderCfiProbeResult, ReaderProbeCfiHandle } from "../shell/types";
import type { ReaderImportRowStatus } from "./readerImportTypes";

export type ReaderImportBookmarkProbeOutcome = {
  status: Extract<ReaderImportRowStatus, "staged" | "not-found">;
  result: ReaderCfiProbeResult;
};

export async function probeReaderImportBookmarkCfi({
  cfiHint,
  probeCfi,
}: {
  cfiHint?: string;
  probeCfi: ReaderProbeCfiHandle | null;
}): Promise<ReaderImportBookmarkProbeOutcome> {
  const cfi = cfiHint?.trim() ?? "";
  if (!cfi) return { status: "not-found", result: { ok: false, code: "invalid", error: "Bookmark row has no CFI hint." } };
  if (!probeCfi) return { status: "not-found", result: { ok: false, code: "unsupported", error: "CFI probe is unavailable." } };

  try {
    const result = await probeCfi(cfi);
    return { status: result.ok ? "staged" : "not-found", result };
  } catch (error) {
    return {
      status: "not-found",
      result: { ok: false, code: "resolution-failed", error: error instanceof Error ? error.message : "CFI probe failed." },
    };
  }
}
