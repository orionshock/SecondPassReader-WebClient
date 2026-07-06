import { useEffect } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon";
import { InlineMeta } from "../../../components/MetaSeparator";
import type { ReaderImportJob } from "./readerImportTypes";
import { ReaderImportRowList } from "./ReaderImportRowList";

export function ReaderImportDrawer({
  open,
  job,
  counts,
  onClose,
  onClear,
  onSelectRow,
  onSkipRow,
  onUnskipRow,
}: {
  open: boolean;
  job: ReaderImportJob | null;
  counts: { pending: number; accepted: number; skipped: number; notFound: number };
  onClose: () => void;
  onClear: () => void;
  onSelectRow: (rowId: string) => void;
  onSkipRow: (rowId: string) => void;
  onUnskipRow: (rowId: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open || !job) return null;

  const summaryDisplay = job.summaryDisplay ?? {
    eyebrow: "Import file",
    title: job.fileName,
    metadata: [{ label: "Rows", value: String(job.rows.length) }],
  };
  const summaryMetadata = summaryDisplay.metadata?.map((item) => `${item.value} ${item.label.toLowerCase()}`) ?? [];

  return (
    <aside
      className="spReaderImportDrawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="sp-reader-import-drawer-title"
    >
      <div className="spReaderImportDrawerHeader">
        <div>
          <h2 id="sp-reader-import-drawer-title" className="spReaderImportDrawerTitle">Marginalia import</h2>
          <div className="muted spReaderImportFileName">{job.fileName}</div>
        </div>
        <button type="button" className="button buttonCompact spReaderImportIconButton" onClick={onClose} aria-label="Close import" title="Close">
          <MaterialIcon name="close" />
        </button>
      </div>

      <div className="spReaderImportSummary">
        <div className="spReaderImportSourceSummary">
          {summaryDisplay.eyebrow ? <div className="muted spReaderImportSourceLabel">{summaryDisplay.eyebrow}</div> : null}
          {summaryDisplay.title ? <div className="spReaderImportSourceTitle">{summaryDisplay.title}</div> : null}
          {summaryMetadata.length > 0 ? <InlineMeta items={summaryMetadata} /> : null}
        </div>
        <InlineMeta
          items={[
            `${counts.pending} pending`,
            `${counts.accepted} accepted`,
            `${counts.skipped} skipped`,
            `${counts.notFound} not found`,
          ]}
        />
        {job.warnings?.length ? <div className="muted spReaderImportWarnings">{job.warnings.join(" ")}</div> : null}
      </div>

      <ReaderImportRowList
        job={job}
        onSelectRow={onSelectRow}
        onSkipRow={onSkipRow}
        onUnskipRow={onUnskipRow}
      />

      <div className="spReaderImportDrawerFooter">
        <button type="button" className="button buttonCompact" onClick={onClear}>Clear import</button>
      </div>
    </aside>
  );
}
