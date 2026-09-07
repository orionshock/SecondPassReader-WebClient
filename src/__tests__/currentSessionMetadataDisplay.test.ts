import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CurrentSessionMetadataEditor } from "../features/reader/annotations/CurrentSessionMetadata.Editor";

describe("Reader current-session metadata", () => {
  it("uses the shared short-suffix display name for an unnamed session", () => {
    const rawSessionId = "51388269-2a4b-4a13-8428-7b57805a7445";
    const html = renderToStaticMarkup(createElement(CurrentSessionMetadataEditor, {
      sessionId: rawSessionId,
      name: "",
      notes: null,
      onSave: vi.fn(),
    }));

    expect(html).toContain("Unnamed Session 5a7445");
    expect(html).not.toContain(rawSessionId);
  });

  it("does not render metadata editing for a read-only session snapshot", () => {
    const html = renderToStaticMarkup(createElement(CurrentSessionMetadataEditor, {
      sessionId: "session-1",
      name: "Closed reading",
      notes: "Done",
      readOnly: true,
      onSave: vi.fn(),
    }));

    expect(html).toContain("Closed reading");
    expect(html).not.toContain("Edit session details");
  });
});
