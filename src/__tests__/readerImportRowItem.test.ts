import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ReaderImportRowItem } from "../features/reader/imports/ReaderImportRowItem";
import type { ReaderImportRow } from "../features/reader/imports/readerImportTypes";

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

  it("renders manual completion as a terminal status without retry actions", () => {
    const markup = renderRow({ status: "manually-completed" });
    expect(markup).toContain("Manually completed");
    expect(markup).not.toContain("Mark manually completed");
    expect(markup).not.toContain(">Skip<");
  });

  it("offers a clearly labelled manual completion action only for staged rows", () => {
    const stagedMarkup = renderRow({ status: "staged" });
    const pendingMarkup = renderRow({ status: "pending" });
    expect(stagedMarkup).toContain('aria-label="Mark manually completed"');
    expect(stagedMarkup).toContain("task_alt");
    expect(pendingMarkup).not.toContain("Mark manually completed");
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
    onUnskip: vi.fn(),
  }));
}
