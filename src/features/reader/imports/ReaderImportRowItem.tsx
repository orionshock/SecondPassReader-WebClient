import type { ReaderImportRow } from "./readerImportTypes";
import { toAnnotationCssVars } from "../annotations/annotationColors";

export function ReaderImportRowItem({
  row,
  selected,
  onSelect,
  onSkip,
  onUnskip,
}: {
  row: ReaderImportRow;
  selected: boolean;
  onSelect: () => void;
  onSkip: () => void;
  onUnskip: () => void;
}) {
  const colorVars = toAnnotationCssVars(row.normalizedColor ?? "yellow");

  return (
    <article
      className={`spReaderImportRow${selected ? " spReaderImportRowSelected" : ""}`}
      style={{ ["--annotation-color" as any]: colorVars.color, ["--annotation-bg" as any]: colorVars.bg }}
    >
      <div className="spReaderImportRowHeader">
        <button
          type="button"
          className="spReaderImportRowMetaButton"
          onClick={onSelect}
          aria-current={selected ? "true" : undefined}
        >
          <span className="spReaderImportRowMeta">
            <span>#{row.index}</span>
            {row.kind === "bookmark" ? <span>Bookmark</span> : null}
            <span className={`spReaderImportStatus spReaderImportStatus-${row.status}`}>{statusLabel(row.status)}</span>
          </span>
        </button>
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
      <button type="button" className="spReaderImportRowMain" onClick={onSelect} aria-current={selected ? "true" : undefined}>
        {row.kind === "bookmark" ? null : row.importedText.trim() ? (
          <span className="spAnnotationQuote spReaderImportQuote">{row.importedText}</span>
        ) : (
          <span className="muted spReaderImportLocation">No highlight text</span>
        )}
        {row.importedNote ? <span className="spAnnotationNote spReaderImportNote">{row.importedNote}</span> : null}
        {row.kind === "bookmark" && row.importedLocation ? (
          <span className="muted spReaderImportLocation">{row.importedLocation}</span>
        ) : null}
      </button>
    </article>
  );
}

function statusLabel(status: ReaderImportRow["status"]): string {
  if (status === "not-found") return "Not found";
  if (status === "staged") return "Staged";
  return status[0].toUpperCase() + status.slice(1);
}
