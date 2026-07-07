import type { ReaderLocationDescription } from "../domain/types";
import type { ReaderCfiProbeResult, ReaderDescribeCfiHandle } from "./types";

export async function probeReaderCfi(describeCfi: ReaderDescribeCfiHandle, cfi: string): Promise<ReaderCfiProbeResult> {
  const trimmed = cfi.trim();
  if (!trimmed) return { ok: false, error: "CFI is required." };

  try {
    const description = await describeCfi(trimmed);
    return { ok: true, description: formatCfiProbeDescription(description) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "CFI probe failed." };
  }
}

function formatCfiProbeDescription(description: ReaderLocationDescription): string | undefined {
  if (description.href) return description.href;
  if (typeof description.spineIndex === "number") return `Spine ${description.spineIndex}`;
  if (typeof description.bookProgress === "number") return `${Math.round(description.bookProgress * 100)}%`;
  return undefined;
}
