import { createElement, Fragment, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShelvesPreviewLoadFailure } from "../../features/home/ShelvesPreviewPanel.UI";
import { LibraryResultsLoadErrorNotice } from "../../features/library/LibraryResultsLoadErrorNotice.UI";
import { LibraryBooksResults } from "../../features/library/results/LibraryBooksResults.UI";
import { ShelvesLoadErrorNotice } from "../../features/shelves/ShelvesPage.UI";
import { authorizationError } from "./ApiErrorTest.Fixtures";

describe("page-local load errors", () => {
  it("provides connection recovery for a library authorization failure", () => {
    const error = authorizationError();
    const html = render(createElement(Fragment, null,
      createElement(LibraryResultsLoadErrorNotice, { error }),
      createElement(LibraryBooksResults, {
        data: null,
        busy: false,
        hasError: true,
        page: 1,
        pageSize: 20,
        viewMode: "list",
        selectedBookId: null,
        onViewBook: vi.fn(),
        onPageChange: vi.fn(),
        onPageSizeChange: vi.fn(),
      }),
    ));

    expect(html).toContain('href="#/settings?tab=library-server"');
  });

  it("provides retry and connection recovery for a shelves authorization failure", () => {
    const html = render(createElement(ShelvesLoadErrorNotice, {
      error: authorizationError(),
      disabled: false,
      onRetry: vi.fn(),
    }));
    expect(html).toContain("<button");
    expect(html).toContain('href="#/settings?tab=library-server"');
  });

  it("provides retry for a Home shelves authorization failure", () => {
    const html = render(createElement(ShelvesPreviewLoadFailure, {
      error: authorizationError(),
      disabled: false,
      onRetry: vi.fn(),
    }));
    expect(html).toContain("<button");
  });
});

function render(...elements: ReactElement[]): string {
  return renderToStaticMarkup(createElement(Fragment, null, ...elements));
}
