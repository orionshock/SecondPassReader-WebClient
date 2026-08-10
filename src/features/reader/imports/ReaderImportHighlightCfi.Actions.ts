import type { ReaderCfiRangeStageResult } from "../domain/types";
import type { ReaderDisplayCfiHandle, ReaderProbeCfiHandle, StagedSelectionHandle } from "../domain/ReaderBridge.Types";
import type { ReaderImportRow } from "./ReaderImport.Types";
import { normalizeImportedHighlightColor } from "./ReaderImportColors.Mapper";

export async function stageReaderImportHighlightCfi({
  jobId,
  row,
  probeCfi,
  displayCfi,
  stagedSelection,
}: {
  jobId: string;
  row: ReaderImportRow;
  probeCfi: ReaderProbeCfiHandle | null;
  displayCfi: ReaderDisplayCfiHandle | null;
  stagedSelection: StagedSelectionHandle | null;
}): Promise<ReaderCfiRangeStageResult> {
  const cfi = row.cfiHint?.trim() ?? "";
  if (!cfi) return { ok: false, code: "invalid", error: "Highlight row has no CFI range hint." };
  if (!probeCfi || !displayCfi || !stagedSelection) return { ok: false, code: "unsupported", error: "Safe CFI range staging is unavailable." };

  try {
    const probe = await probeCfi(cfi);
    if (!probe.ok) {
      const code = probe.code === "missing-target"
        ? "missing-target"
        : probe.code === "unsupported"
          ? "unsupported"
          : probe.code === "invalid"
            ? "invalid"
            : "stage-failed";
      return { ok: false, code, error: probe.error };
    }
    if (probe.cfiKind !== "range") return { ok: false, code: "invalid", error: "Highlight CFI must identify a range." };
    const text = probe.rangeText?.trim() || "";
    if (!text) return { ok: false, code: "verification-failed", error: "Highlight CFI range has no readable text." };
    return await stagedSelection.runStagingTransaction(async () => {
      const display = await displayCfi(cfi, { navigationIntent: "import-staging" });
      if (!display.ok) return { ok: false, code: display.code === "verification-failed" ? "verification-failed" : "stage-failed", error: display.error };
      await stagedSelection.stageSelectionFromCfiRange({
        cfiRange: cfi,
        text,
        note: row.noteText,
        color: normalizeImportedHighlightColor(row.color),
        source: { kind: "import", importJobId: jobId, importRowId: row.id },
      });
      return { ok: true, code: "staged" };
    });
  } catch (error) {
    return { ok: false, code: "stage-failed", error: error instanceof Error ? error.message : "CFI range staging failed." };
  }
}
