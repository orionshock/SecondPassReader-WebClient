import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ReaderImportRowItem } from "../features/reader/imports/ReaderImportRow.UI";
import type { ReaderImportRow } from "../features/reader/imports/ReaderImport.Types";

describe("reader import row item", () => {
  it("renders staged candidate position beside the status", () => {
    const markup = renderRow({ status: "staged", candidateIndex: 3, candidateCount: 25 });
    expect(markup).toContain("Staged - Match 3 of 25");
  });

  it("does not render candidate position for a pending row", () => {
    const markup = renderRow({ status: "pending", candidateIndex: 3, candidateCount: 25 });
    expect(markup).not.toContain("Match 3 of 25");
  });

  it("does not render candidate position for a single staged match", () => {
    const markup = renderRow({ status: "staged", candidateIndex: 1, candidateCount: 1 });
    expect(markup).not.toContain("Match 1 of 1");
  });

  it("renders manual completion as a terminal status with an explicit undo action", () => {
    const markup = renderRow({ status: "manually-completed" });
    expect(markup).toContain("Manually completed");
    expect(markup).not.toContain("Mark manually completed");
    expect(markup).not.toContain(">Skip<");
    expect(markup).toContain('aria-label="Undo manual completion"');
  });

  it("offers a clearly labelled manual completion action for reviewable rows", () => {
    const stagedMarkup = renderRow({ status: "staged" });
    const pendingMarkup = renderRow({ status: "pending" });
    const notFoundMarkup = renderRow({ status: "not-found" });
    expect(stagedMarkup).toContain('aria-label="Mark manually completed"');
    expect(pendingMarkup).toContain('aria-label="Mark manually completed"');
    expect(notFoundMarkup).toContain('aria-label="Mark manually completed"');
  });

  it("shows manual completion disabled while matching is in flight", () => {
    const markup = renderRow({ status: "searching" });
    expect(markup).toMatch(/<button[^>]*aria-label="Mark manually completed"[^>]*disabled/);
  });
});

function renderRow(overrides: Partial<ReaderImportRow>): string {
  const row: ReaderImportRow = {
    id: "row-1",
    kind: "highlight",
    index: 68,
    quoteText: "Imported quote",
    status: "pending",
    ...overrides,
  };
  return renderToStaticMarkup(createElement(ReaderImportRowItem, {
    row,
    selected: false,
    onActivate: vi.fn(),
    onMarkManuallyCompleted: vi.fn(),
    onSkip: vi.fn(),
    onUndoManualCompletion: vi.fn(),
    onUnskip: vi.fn(),
  }));
}
