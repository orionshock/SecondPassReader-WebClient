import type { ReaderImportJob } from "./readerImportTypes";
import { ReaderImportRowItem } from "./ReaderImportRowItem";

export function ReaderImportRowList({
  job,
  onActivateRow,
  onMarkManuallyCompleted,
  onSkipRow,
  onUndoManualCompletion,
  onUnskipRow,
}: {
  job: ReaderImportJob;
  onActivateRow: (rowId: string) => void;
  onMarkManuallyCompleted: (rowId: string) => void;
  onSkipRow: (rowId: string) => void;
  onUndoManualCompletion: (rowId: string) => void;
  onUnskipRow: (rowId: string) => void;
}) {
  return (
    <div className="spReaderImportRows">
      {job.rows.length === 0 ? <div className="muted spReaderImportEmpty">No importable highlights found.</div> : null}
      {job.rows.map((row) => (
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
