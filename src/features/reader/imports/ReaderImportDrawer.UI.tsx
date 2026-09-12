import { useEffect, useMemo, useState } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import type { ReaderImportJobCounts } from "./ReaderImportJob.State";
import type { ReaderImportJob } from "./ReaderImport.Types";
import { ReaderImportRowList } from "./ReaderImportRowList.UI";
import { areAllReaderImportStatusFiltersEnabled, createDefaultReaderImportStatusFilters, filterReaderImportRows, READER_IMPORT_STATUS_GROUPS, showAllReaderImportStatusFilters, toggleReaderImportStatusFilter, type ReaderImportStatusFilters, type ReaderImportStatusGroup } from "./ReaderImportStatusFilter.State";

const statusFilterLabels: Record<ReaderImportStatusGroup, string> = {
  pending: "Pending",
  accepted: "Accepted",
  skipped: "Skipped",
  "not-found": "Not found",
  "manually-completed": "Completed manually",
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
      aria-labelledby="sp-reader-import-drawer-title"
    >
      <div className="spReaderImportDrawerHeader">
        <div className="spReaderImportDrawerTitleRow">
          <h2 id="sp-reader-import-drawer-title" className="spReaderImportDrawerTitle">Import Marginalia</h2>
          <ReaderImportDrawerHeaderActions onHide={onClose} onClear={onClear} />
        </div>
        <div className="spReaderImportFileName">{job.fileName}</div>
        <div className="spReaderImportStatusFilters" role="group" aria-label="Filter imported items by status">
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
    </aside>
  );
}

export function ReaderImportDrawerHeaderActions({
  onHide,
  onClear,
}: {
  onHide: () => void;
  onClear: () => void;
}) {
  return (
    <div className="spReaderImportHeaderActions">
      <button
        type="button"
        className="button buttonCompact spReaderImportIconButton"
        onClick={onHide}
        aria-label="Hide import drawer"
        title="Hide import drawer"
      >
        <MaterialIcon name="close" />
      </button>
      <button
        type="button"
        className="button buttonCompact spReaderImportIconButton spReaderImportClearButton"
        onClick={() => {
          if (window.confirm("Clear this import review? Imported annotations will remain, but this review and its progress will be removed.")) {
            onClear();
          }
        }}
        aria-label="Clear import review"
        title="Clear import review"
      >
        <MaterialIcon name="delete_sweep" />
      </button>
    </div>
  );
}
