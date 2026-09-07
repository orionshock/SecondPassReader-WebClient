import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MarginaliaSession } from "@secondpass/client";
import { SessionDetailHeader } from "../features/sessions/SessionDetail.Header";
import { SessionDetailMetadataEditor } from "../features/sessions/SessionDetailMetadata.Editor";
import { SessionDetailTitleEditor } from "../features/sessions/SessionDetailTitle.Editor";

const rawSessionId = "49d47f00-a77c-4d1c-96af-e4941bc93327";

function session(status: MarginaliaSession["status"]): MarginaliaSession {
  return {
    id: rawSessionId,
    name: "Initial Kindle Import 49d47f",
    notes: "Keep this note in the metadata area.",
    status,
    startedAt: "2026-08-01T00:00:00Z",
    closedAt: status === "closed" ? "2026-08-02T00:00:00Z" : null,
    updatedAt: "2026-08-02T00:00:00Z",
    lastActivityAt: "2026-08-02T00:00:00Z",
    annotationCount: 3,
    progress: null,
  };
}

function renderDetailChrome(status: MarginaliaSession["status"]): string {
  const value = session(status);
  const isActive = status === "active";
  const noop = vi.fn();

  return renderToStaticMarkup(createElement(Fragment, null,
    createElement(SessionDetailTitleEditor, {
      displayName: value.name,
      savedName: value.name,
      isActive,
      draftName: value.name,
      setDraftName: noop,
      editingName: false,
      setEditingName: noop,
      saveBusy: false,
      saveError: null,
      clearSaveError: noop,
      onSaveName: noop,
    }),
    createElement(SessionDetailHeader, {
      book: { id: "book-1", title: "Brief Cases", coverUrl: null, canOpen: true },
      coverSrc: null,
      bookLine: [],
      statusText: status,
      progressText: "Chapter 4",
      annotationText: "3 annotations",
      isActive,
      canOpenReader: true,
      onOpenReader: noop,
      onCloseSession: noop,
      onOpenBookSessions: noop,
    }),
    createElement(SessionDetailMetadataEditor, {
      session: value,
      isActive,
      draftNotes: value.notes,
      setDraftNotes: noop,
      editingNotes: false,
      setEditingNotes: noop,
      saveBusy: false,
      saveError: null,
      clearSaveError: noop,
      onSaveNotes: noop,
    }),
  ));
}

describe("session detail layout", () => {
  it("promotes the display name, hides the raw id, and preserves active controls and notes", () => {
    const html = renderDetailChrome("active");

    expect(html).toContain("<h2");
    expect(html).toContain("Initial Kindle Import 49d47f</h2>");
    expect(html).not.toContain(rawSessionId);
    expect(html).toContain('aria-label="Edit session name"');
    expect(html).toContain("Brief Cases");
    expect(html).toContain("Keep this note in the metadata area.");
    expect(html).toContain('aria-label="Edit session notes"');
    expect(html).toContain("Open reader");
    expect(html).toContain("Close session");
  });

  it("keeps closed sessions read-only while retaining their title, note, and reader control", () => {
    const html = renderDetailChrome("closed");

    expect(html).toContain("Initial Kindle Import 49d47f</h2>");
    expect(html).not.toContain(rawSessionId);
    expect(html).not.toContain('aria-label="Edit session name"');
    expect(html).not.toContain('aria-label="Edit session notes"');
    expect(html).toContain("Name, notes, and annotations are read-only.");
    expect(html).toContain("Keep this note in the metadata area.");
    expect(html).toContain("Open reader");
    expect(html).not.toContain("Close session");
  });
});
