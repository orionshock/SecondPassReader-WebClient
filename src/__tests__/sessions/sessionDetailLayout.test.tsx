import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MarginaliaSession } from "@secondpass/client";
import { SessionDetailAnnotationsList } from "../../features/sessions/SessionDetailAnnotationsList.UI";
import { SessionDetailHeader } from "../../features/sessions/SessionDetailHeader.UI";
import { SessionDetailMetadataEditor } from "../../features/sessions/SessionDetailMetadataEditor.UI";
import { SessionDetailTitleEditor } from "../../features/sessions/SessionDetailTitleEditor.UI";
import { rawSessionId, sessionFixture } from "./SessionTest.Fixtures";

function session(status: MarginaliaSession["status"], notes = "Keep this note in the metadata area."): MarginaliaSession {
  return sessionFixture({
    name: "Initial Kindle Import 49d47f",
    notes,
    status,
    startedAt: "2026-08-01T00:00:00Z",
    closedAt: status === "closed" ? "2026-08-02T00:00:00Z" : null,
    updatedAt: "2026-08-02T00:00:00Z",
    lastActivityAt: "2026-08-02T00:00:00Z",
    annotationCount: 3,
    progress: null,
  });
}

function renderDetailChrome(status: MarginaliaSession["status"], notes?: string): string {
  const value = session(status, notes);
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
      statusText: isActive ? "Active" : "Closed",
      progressText: "Chapter 4",
      annotationText: "3 annotations",
      startedText: "Started date",
      updatedText: "Updated date",
      closedText: isActive ? null : "Closed date",
      noteContent: createElement(SessionDetailMetadataEditor, {
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
      isActive,
      canOpenReader: true,
      onOpenReader: noop,
      onCloseSession: noop,
      onOpenBookSessions: noop,
    }),
    createElement(SessionDetailAnnotationsList, {
      annotations: [],
      annoBusy: false,
      annoError: null,
    }),
  ));
}

describe("session detail layout", () => {
  it("promotes the display name, hides the raw id, and preserves active controls and notes", () => {
    const html = renderDetailChrome("active");

    expect(html).toContain("<h2");
    expect(html).toContain("Initial Kindle Import 49d47f</h2>");
    expect(html).not.toContain(rawSessionId);
    expect(html).toContain('aria-label="Edit Reading Session name"');
    expect(html).toContain("Brief Cases");
    expect(html).toContain(">Active</span>");
    expect(html).toContain("Chapter 4");
    expect(html).toContain("3 annotations");
    expect(html).toContain("Started date");
    expect(html).toContain("Updated date");
    expect(html).toContain("Keep this note in the metadata area.");
    expect(html).toContain('aria-label="Edit Reading Session notes"');
    expect(html).toContain("buttonPrimary");
    expect(html).toContain("buttonDanger");
    expect(html).toContain("0 total");
    expect(html.indexOf("Brief Cases")).toBeLessThan(html.indexOf("Annotations"));
  });

  it("keeps closed sessions read-only while retaining their title, note, and reader control", () => {
    const html = renderDetailChrome("closed");

    expect(html).toContain("Initial Kindle Import 49d47f</h2>");
    expect(html).not.toContain(rawSessionId);
    expect(html).not.toContain('aria-label="Edit Reading Session name"');
    expect(html).not.toContain('aria-label="Edit Reading Session notes"');
    expect(html).toContain(">Closed</span>");
    expect(html).toContain("Closed date");
    expect(html).toContain("Keep this note in the metadata area.");
    expect(html).toContain("buttonPrimary");
    expect(html).not.toContain("buttonDanger");
    expect(html).toContain("0 total");
  });

  it("keeps the empty-note state in the hero with the existing permission gates", () => {
    const activeHtml = renderDetailChrome("active", "");
    const closedHtml = renderDetailChrome("closed", "");

    expect(activeHtml).toContain('aria-label="Edit Reading Session notes"');
    expect(closedHtml).not.toContain('aria-label="Edit Reading Session notes"');
  });

  it("keeps the bounded note editor and its save controls", () => {
    const value = session("active");
    const noop = vi.fn();
    const html = renderToStaticMarkup(createElement(SessionDetailMetadataEditor, {
      session: value,
      isActive: true,
      draftNotes: value.notes,
      setDraftNotes: noop,
      editingNotes: true,
      setEditingNotes: noop,
      saveBusy: false,
      saveError: null,
      clearSaveError: noop,
      onSaveNotes: noop,
    }));

    expect(html).toContain(`${value.notes.length}/65536`);
    expect(html).toContain('maxLength="65536"');
    expect(html).not.toContain("placeholder=");
    expect(html).toContain("Cancel</button>");
    expect(html).toContain("Save</button>");
  });
});
