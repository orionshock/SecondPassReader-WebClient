import type { ReaderCfiDisplayResult } from "../domain/types";
import type { ReaderDisplayCfiHandle } from "./types";

export async function displayReaderCfiSafely(displayCfi: ReaderDisplayCfiHandle, cfi: string): Promise<ReaderCfiDisplayResult> {
  const trimmed = cfi.trim();
  if (!trimmed) return { ok: false, code: "invalid", error: "CFI is required." };
  try {
    return await displayCfi(trimmed);
  } catch (error) {
    return { ok: false, code: "display-failed", error: error instanceof Error ? error.message : "CFI display failed." };
  }
}
