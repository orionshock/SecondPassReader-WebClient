import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getUserFacingErrorMessage } from "../../app/AppUserFacingErrors.Mapper";
import { RecentReadingLoadFailure } from "../../features/library/RecentReadingPanel.UI";
import { apiError, authorizationError, htmlApiError } from "../app/ApiErrorTest.Fixtures";

describe("recent reading errors", () => {
  it("does not render an HTML API error body and keeps Retry available", () => {
    const error = htmlApiError();

    const html = renderToStaticMarkup(createElement(RecentReadingLoadFailure, {
      error,
      disabled: false,
      onRetry: vi.fn(),
    }));

    expect(html).toContain("Could not load recent reading.");
    expect(html).toContain("Retry");
    expect(html).not.toContain("DOCTYPE");
    expect(html).not.toContain("Django debug page");
  });

  it("preserves a concise non-HTML application error", () => {
    expect(getUserFacingErrorMessage(new Error("Network request failed."), "Fallback.")).toBe(
      "Network request failed.",
    );
  });

  it("uses the caller fallback for HTML and API errors", () => {
    expect(getUserFacingErrorMessage(new Error("<html>Bad gateway</html>"), "Safe fallback.")).toBe(
      "Safe fallback.",
    );
    expect(
      getUserFacingErrorMessage(
        apiError(500, "Request failed: 500"),
        "Safe fallback.",
      ),
    ).toBe("Safe fallback.");
  });

  it("shows the Home authorization fallback for recent reading", () => {
    const html = renderToStaticMarkup(createElement(RecentReadingLoadFailure, {
      error: authorizationError(401),
      disabled: false,
      onRetry: vi.fn(),
    }));

    expect(html).toContain("This device is not authorized to load recent reading.");
    expect(html).toContain("Manage connection");
  });
});
