import type { ReaderImportRow } from "./readerImportTypes";
import { toAnnotationCssVars } from "../annotations/annotationColors";

export function ReaderImportRowItem({
  row,
  selected,
  onActivate,
  onSkip,
  onUnskip,
}: {
  row: ReaderImportRow;
  selected: boolean;
  onActivate: () => void;
  onSkip: () => void;
  onUnskip: () => void;
}) {
  const colorVars = toAnnotationCssVars(row.color ?? "yellow");
  const quoteText = row.quoteText?.trim() ?? "";
  const cfiHint = row.cfiHint?.trim() ?? "";

  return (
    <article
      className={`spReaderImportRow${selected ? " spReaderImportRowSelected" : ""}`}
      style={{ ["--annotation-color" as any]: colorVars.color, ["--annotation-bg" as any]: colorVars.bg }}
    >
      <div className="spReaderImportRowHeader">
        <span className="spReaderImportRowMeta" aria-current={selected ? "true" : undefined}>
          <span>#{row.index}</span>
          {row.kind === "bookmark" ? <span>Bookmark</span> : null}
          <span className={`spReaderImportStatus spReaderImportStatus-${row.status}`}>{statusLabel(row.status)}</span>
        </span>
        <div className="spReaderImportRowActions">
          {row.status === "accepted" ? null : row.status === "skipped" ? (
            <button type="button" className="button buttonCompact spReaderImportRowActionButton" onClick={onUnskip}>Unskip</button>
          ) : (
            <>
              {row.status === "searching" ? <span className="muted spReaderImportRowActionText">Searching...</span> : null}
              <button type="button" className="button buttonCompact spReaderImportRowActionButton" onClick={onSkip}>Skip</button>
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
            disabled={row.status === "accepted" || row.status === "skipped" || row.status === "searching"}
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
            disabled={row.status === "accepted" || row.status === "skipped" || row.status === "searching"}
          >
            <span>{cfiHint ? `Location hint: ${cfiHint}` : "No location hint"}</span>
            {row.status === "searching" ? null : <span className="spReaderImportLocationAction">Check location</span>}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function statusLabel(status: ReaderImportRow["status"]): string {
  if (status === "not-found") return "Not found";
  if (status === "staged") return "Staged";
  return status[0].toUpperCase() + status.slice(1);
}
