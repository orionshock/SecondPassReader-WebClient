import { Children, createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReaderImportDrawer, ReaderImportDrawerHeaderActions } from "../features/reader/imports/ReaderImportDrawer";
import { getReaderImportJobCounts } from "../features/reader/imports/ReaderImportJob.State";
import { createDefaultReaderImportStatusFilters, filterReaderImportRows, getReaderImportStatusGroup, showAllReaderImportStatusFilters, toggleReaderImportStatusFilter } from "../features/reader/imports/ReaderImportStatusFilter.State";
import type { ReaderImportJob, ReaderImportRow } from "../features/reader/imports/ReaderImport.Types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reader import status filters", () => {
  it("shows unresolved and reviewable rows by default", () => {
    const rows = statuses("pending", "searching", "staged", "not-found", "accepted", "skipped", "manually-completed");

    expect(filterReaderImportRows(rows, createDefaultReaderImportStatusFilters()).map((row) => row.status)).toEqual([
      "pending",
      "searching",
      "staged",
      "not-found",
    ]);
  });

  it("toggles a status group without changing other group visibility", () => {
    const defaults = createDefaultReaderImportStatusFilters();
    const withAccepted = toggleReaderImportStatusFilter(defaults, "accepted");
    const withoutPending = toggleReaderImportStatusFilter(withAccepted, "pending");
    const rows = statuses("pending", "accepted", "not-found");

    expect(filterReaderImportRows(rows, withAccepted).map((row) => row.status)).toEqual(["pending", "accepted", "not-found"]);
    expect(filterReaderImportRows(rows, withoutPending).map((row) => row.status)).toEqual(["accepted", "not-found"]);
  });

  it("groups pending, searching, and staged rows under the pending filter", () => {
    expect(getReaderImportStatusGroup("pending")).toBe("pending");
    expect(getReaderImportStatusGroup("searching")).toBe("pending");
    expect(getReaderImportStatusGroup("staged")).toBe("pending");
  });

  it("keeps summary counts based on the complete job while rows are filtered", () => {
    const rows = statuses("pending", "accepted", "accepted", "manually-completed");
    const visibleRows = filterReaderImportRows(rows, createDefaultReaderImportStatusFilters());

    expect(visibleRows).toHaveLength(1);
    expect(getReaderImportJobCounts(rows)).toMatchObject({ pending: 1, accepted: 2, manuallyCompleted: 1 });
  });

  it("can restore every status group through show all", () => {
    const rows = statuses("pending", "accepted", "skipped", "not-found", "manually-completed");

    expect(filterReaderImportRows(rows, showAllReaderImportStatusFilters())).toEqual(rows);
  });

  it("renders accessible default chips, disables empty groups, and keeps visible row actions", () => {
    const rows = statuses("pending", "accepted");
    const markup = renderDrawer(rows);

    expect(markup).toContain('aria-pressed="true"><span>Pending</span><span aria-hidden="true">1</span>');
    expect(markup).toContain('aria-pressed="false"><span>Accepted</span><span aria-hidden="true">1</span>');
    expect(markup).toContain('aria-pressed="false" disabled=""><span>Skipped</span>');
    expect(markup).toContain("quote-pending");
    expect(markup).not.toContain("quote-accepted");
    expect(markup).toContain("Mark manually completed");
    expect(markup).toContain("Show all");
  });

  it("shows a filter-specific empty state when default filters hide every row", () => {
    expect(renderDrawer(statuses("accepted"))).toContain("No rows match the selected filters.");
  });

  it("renders distinct accessible hide and clear header actions without the old footer control", () => {
    const markup = renderDrawer(statuses("pending"));

    expect(markup).toContain('aria-label="Hide import drawer"');
    expect(markup).toContain('title="Hide import drawer"');
    expect(markup).toContain('aria-label="Clear import"');
    expect(markup).toContain('title="Clear import"');
    expect(markup).toContain("delete_sweep");
    expect(markup).not.toContain(">Clear import</button>");
    expect(markup).toContain("Filter import rows by status");
  });

  it("keeps hide and clear callbacks semantically separate", () => {
    const onHide = vi.fn();
    const onClear = vi.fn();
    const confirm = vi.fn(() => true);
    vi.stubGlobal("window", { confirm });
    const actions = ReaderImportDrawerHeaderActions({ onHide, onClear });
    const buttons = Children.toArray(actions.props.children)
      .filter(isValidElement) as ReactElement<{ onClick: () => void }>[];

    buttons[0]?.props.onClick();
    expect(onHide).toHaveBeenCalledOnce();
    expect(onClear).not.toHaveBeenCalled();

    buttons[1]?.props.onClick();
    expect(onHide).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("leaves the import job untouched when clear confirmation is canceled", () => {
    const onClear = vi.fn();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", { confirm });
    const actions = ReaderImportDrawerHeaderActions({ onHide: vi.fn(), onClear });
    const buttons = Children.toArray(actions.props.children)
      .filter(isValidElement) as ReactElement<{ onClick: () => void }>[];

    buttons[1]?.props.onClick();

    expect(confirm).toHaveBeenCalledOnce();
    expect(onClear).not.toHaveBeenCalled();
  });
});

function statuses(...values: ReaderImportRow["status"][]): ReaderImportRow[] {
  return values.map((status, index) => ({
    id: `row-${index}`,
    index: index + 1,
    kind: "highlight",
    quoteText: `quote-${status}`,
    status,
  }));
}

function renderDrawer(rows: ReaderImportRow[]): string {
  const job: ReaderImportJob = {
    id: "job-1",
    format: "glasp-csv",
    fileName: "highlights.csv",
    createdAt: "2026-08-09T00:00:00.000Z",
    rows,
  };
  return renderToStaticMarkup(createElement(ReaderImportDrawer, {
    open: true,
    job,
    counts: getReaderImportJobCounts(rows),
    onClose: vi.fn(),
    onClear: vi.fn(),
    onActivateRow: vi.fn(),
    onMarkManuallyCompleted: vi.fn(),
    onSkipRow: vi.fn(),
    onUndoManualCompletion: vi.fn(),
    onUnskipRow: vi.fn(),
  }));
}
