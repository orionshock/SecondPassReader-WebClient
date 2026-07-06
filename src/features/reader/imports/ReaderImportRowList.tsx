import type { ReaderImportJob } from "./readerImportTypes";
import { ReaderImportRowItem } from "./ReaderImportRowItem";

export function ReaderImportRowList({
  job,
  onSelectRow,
  onSkipRow,
  onUnskipRow,
}: {
  job: ReaderImportJob;
  onSelectRow: (rowId: string) => void;
  onSkipRow?: (rowId: string) => void;
  onUnskipRow?: (rowId: string) => void;
}) {
  return (
    <div className="spReaderImportRows">
      {job.rows.length === 0 ? <div className="muted spReaderImportEmpty">No importable highlights found.</div> : null}
      {job.rows.map((row) => (
        <ReaderImportRowItem
          key={row.id}
          row={row}
          selected={job.activeRowId === row.id}
          onSelect={() => onSelectRow(row.id)}
          onSkip={onSkipRow ? () => onSkipRow(row.id) : undefined}
          onUnskip={onUnskipRow ? () => onUnskipRow(row.id) : undefined}
        />
      ))}
    </div>
  );
}
