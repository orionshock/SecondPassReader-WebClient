import { useEffect, useMemo, useState } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon";
import type { ReaderImportJobCounts } from "./readerImportJobState";
import type { ReaderImportJob } from "./readerImportTypes";
import { ReaderImportRowList } from "./ReaderImportRowList";
import { areAllReaderImportStatusFiltersEnabled, createDefaultReaderImportStatusFilters, filterReaderImportRows, READER_IMPORT_STATUS_GROUPS, showAllReaderImportStatusFilters, toggleReaderImportStatusFilter, type ReaderImportStatusFilters, type ReaderImportStatusGroup } from "./ReaderImportStatusFilter.State";

const statusFilterLabels: Record<ReaderImportStatusGroup, string> = {
  pending: "Pending",
  accepted: "Accepted",
  skipped: "Skipped",
  "not-found": "Not found",
  "manually-completed": "Manual",
};

export function ReaderImportDrawer({
  open,
  job,
  counts,
  onClose,
  onClear,
  onActivateRow,
  onMarkManuallyCompleted,
  onSkipRow,
  onUndoManualCompletion,
  onUnskipRow,
}: {
  open: boolean;
  job: ReaderImportJob | null;
  counts: ReaderImportJobCounts;
  onClose: () => void;
  onClear: () => void;
  onActivateRow: (rowId: string) => void;
  onMarkManuallyCompleted: (rowId: string) => void;
  onSkipRow: (rowId: string) => void;
  onUndoManualCompletion: (rowId: string) => void;
  onUnskipRow: (rowId: string) => void;
}) {
  const [filterState, setFilterState] = useState<{
    jobId: string | null;
    filters: ReaderImportStatusFilters;
  }>(() => ({ jobId: null, filters: createDefaultReaderImportStatusFilters() }));

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

  const filters = filterState.jobId === job?.id
    ? filterState.filters
    : createDefaultReaderImportStatusFilters();
  const visibleRows = useMemo(
    () => filterReaderImportRows(job?.rows ?? [], filters),
    [filters, job?.rows],
  );

  if (!open || !job) return null;

  const countSummary = [
    `${counts.pending} pending`,
    `${counts.accepted} accepted`,
    `${counts.skipped} skipped`,
    `${counts.notFound} not found`,
    `${counts.manuallyCompleted} manually completed`,
  ].join(" / ");
  const statusCounts: Record<ReaderImportStatusGroup, number> = {
    pending: counts.pending,
    accepted: counts.accepted,
    skipped: counts.skipped,
    "not-found": counts.notFound,
    "manually-completed": counts.manuallyCompleted,
  };

  const toggleFilter = (group: ReaderImportStatusGroup) => {
    setFilterState((current) => {
      const currentFilters = current.jobId === job.id
        ? current.filters
        : createDefaultReaderImportStatusFilters();
      return { jobId: job.id, filters: toggleReaderImportStatusFilter(currentFilters, group) };
    });
  };

  return (
    <aside
      className="spReaderImportDrawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="sp-reader-import-drawer-title"
    >
      <div className="spReaderImportDrawerHeader">
        <div className="spReaderImportDrawerTitleRow">
          <h2 id="sp-reader-import-drawer-title" className="spReaderImportDrawerTitle">Marginalia Import</h2>
          <button type="button" className="button buttonCompact spReaderImportIconButton" onClick={onClose} aria-label="Close import" title="Close">
            <MaterialIcon name="close" />
          </button>
        </div>
        <div className="spReaderImportFileName">{job.fileName}</div>
        <div className="spReaderImportStatusFilters" aria-label="Filter import rows by status">
          {READER_IMPORT_STATUS_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              className="spReaderImportStatusFilter"
              aria-pressed={filters[group]}
              disabled={statusCounts[group] === 0}
              onClick={() => toggleFilter(group)}
            >
              <span>{statusFilterLabels[group]}</span>
              <span aria-hidden="true">{statusCounts[group]}</span>
            </button>
          ))}
          <button
            type="button"
            className="spReaderImportStatusFilter spReaderImportStatusFilterShowAll"
            onClick={() => setFilterState({ jobId: job.id, filters: showAllReaderImportStatusFilters() })}
            disabled={areAllReaderImportStatusFiltersEnabled(filters)}
          >
            Show all
          </button>
        </div>
        <span className="srOnly">{countSummary}</span>
        {job.warnings?.length ? <div className="muted spReaderImportWarnings">{job.warnings.join(" ")}</div> : null}
      </div>

      <ReaderImportRowList
        job={job}
        rows={visibleRows}
        onActivateRow={onActivateRow}
        onMarkManuallyCompleted={onMarkManuallyCompleted}
        onSkipRow={onSkipRow}
        onUndoManualCompletion={onUndoManualCompletion}
        onUnskipRow={onUnskipRow}
      />

      <div className="spReaderImportDrawerFooter">
        <button type="button" className="button buttonCompact" onClick={onClear}>Clear import</button>
      </div>
    </aside>
  );
}
