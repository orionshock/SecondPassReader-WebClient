import { createElement, Fragment, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError } from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import { ShelvesPreviewLoadFailure } from "../features/home/ShelvesPreview.Panel";
import { CatalogTagLoadErrorNotice } from "../features/library/catalogTags/CatalogTag.Rail";
import { LibraryResultsLoadErrorNotice } from "../features/library/LibraryResultsLoadError.Notice";
import { LibraryBooksResults } from "../features/library/results/LibraryBooks.Results";
import {
  getSessionsLoadErrorMessage,
  SessionsLoadErrorNotice,
  SessionsNoDataState,
} from "../features/sessions/Sessions.Page";
import { ShelvesLoadErrorNotice } from "../features/shelves/Shelves.Page";

describe("page-local load errors", () => {
  it("shows the library authorization message without an empty successful result", () => {
    const error = authError();
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
      }),
    ));

    expect(html).toContain("This device is not authorized to access the library.");
    expect(html).toContain("Manage connection");
    expect(html).not.toContain("No results yet.");
  });

  it("shows the catalog-tag-specific authorization message", () => {
    const html = render(createElement(CatalogTagLoadErrorNotice, { error: authError() }));
    expect(html).toContain("This device is not authorized to load catalog tags.");
  });

  it("shows the shelves authorization message with Retry", () => {
    const html = render(createElement(ShelvesLoadErrorNotice, {
      error: authError(),
      disabled: false,
      onRetry: vi.fn(),
    }));
    expect(html).toContain("This device is not authorized to access shelves.");
    expect(html).toContain("Retry");
    expect(html).toContain("Manage connection");
  });

  it("shows the sessions authorization message without missing-book or empty copy", () => {
    const html = render(createElement(SessionsLoadErrorNotice, {
      error: authError(),
      hasBookFilter: true,
    }), createElement(SessionsNoDataState, { busy: false, hasError: true }));
    expect(html).toContain("This device is not authorized to access reading sessions.");
    expect(html).not.toContain("That book could not be found");
    expect(html).not.toContain("No sessions yet");
  });

  it("uses missing-book copy only for a book-filtered 404", () => {
    const error = new ApiError({ kind: "http_error", status: 404, message: "Not found." });
    expect(getSessionsLoadErrorMessage(error, true)).toBe("That book could not be found or is not accessible.");
    expect(getSessionsLoadErrorMessage(error, false)).toBe("Could not load reading sessions.");
  });

  it("shows the Home shelves authorization message with Retry", () => {
    const html = render(createElement(ShelvesPreviewLoadFailure, {
      error: authError(),
      disabled: false,
      onRetry: vi.fn(),
    }));
    expect(html).toContain("This device is not authorized to load shelves.");
    expect(html).toContain("Retry");
  });
});

function authError(): ApiError {
  return new ApiError({ kind: "http_error", status: 403, message: "Token is not allowed." });
}

function render(...elements: ReactElement[]): string {
  return renderToStaticMarkup(createElement(Fragment, null, ...elements));
}
