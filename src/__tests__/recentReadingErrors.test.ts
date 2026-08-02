import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError } from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import { getUserFacingErrorMessage } from "../app/userFacingErrors";
import { RecentReadingLoadFailure } from "../features/library/RecentReadingSection";

describe("recent reading errors", () => {
  it("does not render an HTML API error body and keeps Retry available", () => {
    const error = new ApiError({
      kind: "http_error",
      status: 404,
      statusText: "Not Found",
      message: "Request failed: 404 Not Found - <!DOCTYPE html><html><body>Django debug page</body></html>",
    });

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
        new ApiError({ kind: "http_error", status: 500, message: "Request failed: 500" }),
        "Safe fallback.",
      ),
    ).toBe("Safe fallback.");
  });
});
