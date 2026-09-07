import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MarginaliaSession } from "@secondpass/client";
import { SessionDetailAnnotationsList } from "../features/sessions/SessionDetailAnnotations.List";
import { SessionDetailHeader } from "../features/sessions/SessionDetail.Header";
import { SessionDetailMetadataEditor } from "../features/sessions/SessionDetailMetadata.Editor";
import { SessionDetailTitleEditor } from "../features/sessions/SessionDetailTitle.Editor";

const rawSessionId = "49d47f00-a77c-4d1c-96af-e4941bc93327";

function session(status: MarginaliaSession["status"], notes = "Keep this note in the metadata area."): MarginaliaSession {
  return {
    id: rawSessionId,
    name: "Initial Kindle Import 49d47f",
    notes,
    status,
    startedAt: "2026-08-01T00:00:00Z",
    closedAt: status === "closed" ? "2026-08-02T00:00:00Z" : null,
    updatedAt: "2026-08-02T00:00:00Z",
    lastActivityAt: "2026-08-02T00:00:00Z",
    annotationCount: 3,
    progress: null,
  };
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
    expect(html).toContain('aria-label="Edit session name"');
    expect(html).toContain('class="sessionHero"');
    expect(html).toContain('class="sessionCover"');
    expect(html).toContain("Brief Cases");
    expect(html).toContain("Status</span><span><span");
    expect(html).toContain(">Active</span>");
    expect(html).toContain("Location</span><span>Chapter 4");
    expect(html).toContain("Annotations</span><span>3 annotations");
    expect(html).toContain("Started</span><span>Started date");
    expect(html).toContain("Updated</span><span>Updated date");
    expect(html).toContain("Keep this note in the metadata area.");
    expect(html).toContain("Session Note:");
    expect(html).toContain('aria-label="Edit session notes"');
    expect(html).toContain("Open reader");
    expect(html).toContain("Close session");
    expect(html.indexOf('class="sessionHero"')).toBeLessThan(html.indexOf('class="sessionAnnotations"'));
  });

  it("keeps closed sessions read-only while retaining their title, note, and reader control", () => {
    const html = renderDetailChrome("closed");

    expect(html).toContain("Initial Kindle Import 49d47f</h2>");
    expect(html).not.toContain(rawSessionId);
    expect(html).not.toContain('aria-label="Edit session name"');
    expect(html).not.toContain('aria-label="Edit session notes"');
    expect(html).toContain("Name, notes, and annotations are read-only.");
    expect(html).toContain(">Closed</span>");
    expect(html).toContain("Closed</span><span>Closed date");
    expect(html).toContain("Keep this note in the metadata area.");
    expect(html).toContain("Open reader");
    expect(html).not.toContain("Close session");
    expect(html.indexOf('class="sessionHero"')).toBeLessThan(html.indexOf('class="sessionAnnotations"'));
  });

  it("keeps the empty-note state in the hero with the existing permission gates", () => {
    const activeHtml = renderDetailChrome("active", "");
    const closedHtml = renderDetailChrome("closed", "");

    expect(activeHtml).toContain("No Session Note");
    expect(activeHtml).toContain('aria-label="Edit session notes"');
    expect(closedHtml).toContain("No Session Note");
    expect(closedHtml).not.toContain('aria-label="Edit session notes"');
  });

  it("places note edit actions below the editor with Save on the right", () => {
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

    expect(html).toContain('class="sessionNoteEditActions"');
    expect(html).toContain('class="sessionNoteEditFooter"');
    expect(html).toContain("Session Note");
    expect(html).toContain(`${value.notes.length}/500`);
    expect(html).not.toContain("placeholder=");
    expect(html.indexOf("Cancel</button>")).toBeLessThan(html.indexOf("Save</button>"));
  });
});
