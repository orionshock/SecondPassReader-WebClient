import type { ReaderCfiProbeResult } from "../domain/ReaderDomain.Types";
import type { ReaderProbeCfiHandle } from "../domain/ReaderBridge.Types";

export async function probeReaderCfi(probeCfi: ReaderProbeCfiHandle, cfi: string): Promise<ReaderCfiProbeResult> {
  const trimmed = cfi.trim();
  if (!trimmed) return { ok: false, code: "invalid", error: "CFI is required." };

  try {
    return await probeCfi(trimmed);
  } catch (error) {
    return { ok: false, code: "resolution-failed", error: error instanceof Error ? error.message : "CFI probe failed." };
  }
}
