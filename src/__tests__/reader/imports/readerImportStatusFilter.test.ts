// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ReaderImportDrawer, ReaderImportDrawerHeaderActions } from "../../../features/reader/imports/ReaderImportDrawer.UI";
import { getReaderImportJobCounts } from "../../../features/reader/imports/ReaderImportJob.State";
import { createDefaultReaderImportStatusFilters, filterReaderImportRows, getReaderImportStatusGroup, showAllReaderImportStatusFilters, toggleReaderImportStatusFilter } from "../../../features/reader/imports/ReaderImportStatusFilter.State";
import type { ReaderImportJob, ReaderImportRow } from "../../../features/reader/imports/ReaderImport.Types";
import { readerImportRowsWithStatuses } from "./ReaderImportTest.Fixtures";

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

  it("exposes filter state, disables empty groups, and keeps visible row actions", () => {
    const rows = statuses("pending", "accepted");
    const container = markupContainer(renderDrawer(rows));
    const buttons = [...container.querySelectorAll("button")];
    const pending = buttons.find((button) => button.textContent?.includes("Pending"));
    const accepted = buttons.find((button) => button.textContent?.includes("Accepted"));
    const skipped = buttons.find((button) => button.textContent?.includes("Skipped"));

    expect(container.querySelector('[aria-label="Filter import rows by status"]')).not.toBeNull();
    expect(pending?.getAttribute("aria-pressed")).toBe("true");
    expect(accepted?.getAttribute("aria-pressed")).toBe("false");
    expect(skipped?.disabled).toBe(true);
    expect(container.textContent).toContain("quote-pending");
    expect(container.textContent).not.toContain("quote-accepted");
    expect(container.querySelector('[aria-label="Mark manually completed"]')).not.toBeNull();
  });

  it("shows a filter-specific empty state when default filters hide every row", () => {
    expect(renderDrawer(statuses("accepted"))).toContain("No rows match the selected filters.");
  });

  it("renders distinct accessible hide and clear actions", () => {
    const container = markupContainer(renderDrawer(statuses("pending")));

    expect(container.querySelector('button[aria-label="Hide import drawer"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Clear import"]')).not.toBeNull();
  });

  it("keeps hide and clear callbacks semantically separate", () => {
    const onHide = vi.fn();
    const onClear = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = renderHeaderActions(onHide, onClear);

    act(() => view.hide.click());
    expect(onHide).toHaveBeenCalledOnce();
    expect(onClear).not.toHaveBeenCalled();

    act(() => view.clear.click());
    expect(onHide).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledOnce();
    expect(onClear).toHaveBeenCalledOnce();
    view.cleanup();
  });

  it("leaves the import job untouched when clear confirmation is canceled", () => {
    const onClear = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = renderHeaderActions(vi.fn(), onClear);

    act(() => view.clear.click());

    expect(confirm).toHaveBeenCalledOnce();
    expect(onClear).not.toHaveBeenCalled();
    view.cleanup();
  });
});

function statuses(...values: ReaderImportRow["status"][]): ReaderImportRow[] {
  return readerImportRowsWithStatuses(...values);
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

function markupContainer(markup: string): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = markup;
  return container;
}

function renderHeaderActions(onHide: () => void, onClear: () => void) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(createElement(ReaderImportDrawerHeaderActions, { onHide, onClear })));
  const hide = container.querySelector<HTMLButtonElement>('button[aria-label="Hide import drawer"]');
  const clear = container.querySelector<HTMLButtonElement>('button[aria-label="Clear import"]');
  if (!hide || !clear) throw new Error("Expected import header actions.");
  return {
    hide,
    clear,
    cleanup: () => act(() => root.unmount()),
  };
}
