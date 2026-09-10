import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CurrentSessionMetadataEditor } from "../../../features/reader/annotations/CurrentSessionMetadataEditor.UI";
import { rawSessionId, sessionFixture } from "../../sessions/SessionTest.Fixtures";

describe("Reader current-session metadata", () => {
  it("uses the shared short-suffix display name for an unnamed session", () => {
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
    const session = sessionFixture({ status: "closed", name: "Closed reading", notes: "Done" });
    const html = renderToStaticMarkup(createElement(CurrentSessionMetadataEditor, {
      sessionId: session.id,
      name: session.name,
      notes: session.notes,
      readOnly: true,
      onSave: vi.fn(),
    }));

    expect(html).toContain("Closed reading");
    expect(html).not.toContain("Edit session details");
  });
});
