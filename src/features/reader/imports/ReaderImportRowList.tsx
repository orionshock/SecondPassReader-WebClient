import type { ReaderImportJob, ReaderImportRow } from "./ReaderImport.Types";
import { ReaderImportRowItem } from "./ReaderImportRowItem";

export function ReaderImportRowList({
  job,
  rows,
  onActivateRow,
  onMarkManuallyCompleted,
  onSkipRow,
  onUndoManualCompletion,
  onUnskipRow,
}: {
  job: ReaderImportJob;
  rows: ReaderImportRow[];
  onActivateRow: (rowId: string) => void;
  onMarkManuallyCompleted: (rowId: string) => void;
  onSkipRow: (rowId: string) => void;
  onUndoManualCompletion: (rowId: string) => void;
  onUnskipRow: (rowId: string) => void;
}) {
  return (
    <div className="spReaderImportRows">
      {job.rows.length === 0 ? <div className="muted spReaderImportEmpty">No importable highlights found.</div> : null}
      {job.rows.length > 0 && rows.length === 0 ? <div className="muted spReaderImportEmpty">No rows match the selected filters.</div> : null}
      {rows.map((row) => (
        <ReaderImportRowItem
          key={row.id}
          row={row}
          selected={job.activeRowId === row.id}
          onActivate={() => onActivateRow(row.id)}
          onMarkManuallyCompleted={() => onMarkManuallyCompleted(row.id)}
          onSkip={() => onSkipRow(row.id)}
          onUndoManualCompletion={() => onUndoManualCompletion(row.id)}
          onUnskip={() => onUnskipRow(row.id)}
        />
      ))}
    </div>
  );
}
