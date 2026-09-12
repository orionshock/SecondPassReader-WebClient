import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import type { ReaderImportRow } from "./ReaderImport.Types";
import { toAnnotationCssVars } from "../display/ReaderAnnotation.Presenter";
import { isReaderImportRowTerminal } from "./ReaderImportJob.State";

export function ReaderImportRowItem({
  row,
  selected,
  onActivate,
  onMarkManuallyCompleted,
  onSkip,
  onUndoManualCompletion,
  onUnskip,
}: {
  row: ReaderImportRow;
  selected: boolean;
  onActivate: () => void;
  onMarkManuallyCompleted: () => void;
  onSkip: () => void;
  onUndoManualCompletion: () => void;
  onUnskip: () => void;
}) {
  const colorVars = toAnnotationCssVars(row.color ?? "yellow");
  const quoteText = row.quoteText?.trim() ?? "";
  const cfiHint = row.cfiHint?.trim() ?? "";
  const candidateLabel = getCandidateLabel(row);
  const showManualCompletion = row.status !== "accepted"
    && row.status !== "skipped"
    && row.status !== "manually-completed";

  return (
    <article
      className={`spReaderImportRow${selected ? " spReaderImportRowSelected" : ""}${row.status === "not-found" ? " spReaderImportRowNotFound" : ""}`}
      style={{ ["--annotation-color" as any]: colorVars.color, ["--annotation-bg" as any]: colorVars.bg }}
    >
      <div className="spReaderImportRowHeader">
        <span className="spReaderImportRowMeta" aria-current={selected ? "true" : undefined}>
          <span>#{row.index}</span>
          {row.kind === "bookmark" ? <span>Bookmark</span> : null}
          <span className={`spReaderImportStatus spReaderImportStatus-${row.status}`}>
            {statusLabel(row.status)}{candidateLabel ? ` - ${candidateLabel}` : ""}
          </span>
        </span>
        <div className="spReaderImportRowActions">
          {row.status === "accepted" ? null : row.status === "manually-completed" ? (
            <button
              type="button"
              className="button buttonCompact spReaderImportRowActionButton"
              onClick={onUndoManualCompletion}
              aria-label="Mark as incomplete"
              title="Mark as incomplete"
            >
              <MaterialIcon name="undo" className="spReaderImportRowActionIcon" />
              <span>Undo</span>
            </button>
          ) : row.status === "skipped" ? (
            <button type="button" className="button buttonCompact spReaderImportRowActionButton" onClick={onUnskip}>Unskip</button>
          ) : (
            <>
              {row.status === "searching" ? <span className="muted spReaderImportRowActionText">Finding location...</span> : null}
              {showManualCompletion ? (
                <button
                  type="button"
                  className="button buttonCompact spReaderImportRowActionButton"
                  onClick={onMarkManuallyCompleted}
                  aria-label="Mark as completed manually"
                  title="Mark as completed manually"
                  disabled={row.status === "searching"}
                >
                  <MaterialIcon name="task_alt" className="spReaderImportRowActionIcon" />
                  <span>Mark complete</span>
                </button>
              ) : null}
              <button type="button" className="button buttonCompact spReaderImportRowActionButton" onClick={onSkip}>
                <MaterialIcon name="block" className="spReaderImportRowActionIcon" />
                <span>Skip</span>
              </button>
            </>
          )}
        </div>
      </div>
      <div className="spReaderImportRowMain">
        {row.kind === "bookmark" ? null : (
          <button
            type="button"
            className={`spReaderImportQuoteButton${quoteText ? "" : " spReaderImportQuoteButtonEmpty"}`}
            onClick={onActivate}
            disabled={isReaderImportRowTerminal(row.status) || row.status === "searching"}
          >
            {quoteText ? (
              <span className="spAnnotationQuote spReaderImportQuote">{row.quoteText}</span>
            ) : (
              <span className="muted spReaderImportLocation">No highlight text</span>
            )}
          </button>
        )}
        {row.noteText ? <span className="spAnnotationNote spReaderImportNote">{row.noteText}</span> : null}
        {row.kind === "bookmark" ? (
          <button
            type="button"
            className={`spReaderImportLocationButton${cfiHint ? "" : " spReaderImportLocationButtonEmpty"}`}
            onClick={onActivate}
            disabled={isReaderImportRowTerminal(row.status) || row.status === "searching"}
          >
            <span>{cfiHint ? `Location hint: ${cfiHint}` : "No location hint"}</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}

function getCandidateLabel(row: ReaderImportRow): string | null {
  if (row.status !== "staged") return null;
  const index = row.candidateIndex;
  const count = row.candidateCount;
  if (!Number.isInteger(index) || !Number.isInteger(count) || !index || !count || count <= 1 || index > count) return null;
  return `Match ${index} of ${count}`;
}

function statusLabel(status: ReaderImportRow["status"]): string {
  if (status === "not-found") return "Not found";
  if (status === "manually-completed") return "Manually completed";
  if (status === "staged") return "Staged";
  return status[0].toUpperCase() + status.slice(1);
}
