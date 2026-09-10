import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import { SessionDetailAnnotationsList } from "../features/sessions/SessionDetailAnnotationsList.UI";

type HighlightAnnotation = Extract<MarginaliaAnnotation, { kind: "highlight" }>;

function renderAnnotations(annotations: MarginaliaAnnotation[] | null, annoBusy = false, annoError: string | null = null) {
  return renderToStaticMarkup(createElement(SessionDetailAnnotationsList, {
    annotations,
    annoBusy,
    annoError,
  }));
}

function highlight(overrides: Partial<HighlightAnnotation["body"]> = {}): HighlightAnnotation {
  return {
    id: "highlight-1",
    clientId: "client-1",
    kind: "highlight",
    location: { cfi: "epubcfi(/6/2,/4,/8)", locationLabel: "Chapter 01" },
    body: {
      text: "Quoted text",
      prefix: "",
      suffix: "",
      color: "yellow",
      note: "",
      ...overrides,
    },
    createdAt: "2026-08-09T00:00:00Z",
    updatedAt: "2026-08-09T00:00:00Z",
  };
}

function expectReadOnly(html: string) {
  expect(html).not.toContain("<button");
  expect(html).not.toContain("Edit note and color");
  expect(html).not.toContain("Delete highlight");
  expect(html).not.toContain("Save changes");
}

describe("SessionDetailAnnotationsList", () => {
  it("renders a quote-only highlight with shared color presentation", () => {
    const html = renderAnnotations([highlight()]);

    expect(html).toContain("Quoted text");
    expect(html).toContain('title="Highlight"');
    expectReadOnly(html);
  });

  it("renders note-only and quote-with-note highlights", () => {
    const html = renderAnnotations([
      highlight({ text: "", note: "Note without a quote" }),
      { ...highlight({ note: "Reader note" }), id: "highlight-2" },
    ]);

    expect(html).toContain("Note without a quote");
    expect(html).toContain("Reader note");
    expect(html).toContain('title="Commented highlight"');
    expectReadOnly(html);
  });

  it("renders bookmarks through the shared read-only presentation", () => {
    const bookmark = {
      id: "bookmark-1",
      clientId: "client-1",
      kind: "bookmark",
      location: { cfi: "epubcfi(/6/2)", locationLabel: "Chapter 01" },
      createdAt: "2026-08-09T00:00:00Z",
      updatedAt: "2026-08-09T00:00:00Z",
    } satisfies MarginaliaAnnotation;
    const html = renderAnnotations([bookmark]);

    expect(html).toContain('title="Bookmark"');
    expect(html).toContain("Bookmark");
    expectReadOnly(html);
  });

  it("renders empty, loading, and error states without controls", () => {
    const emptyHtml = renderAnnotations([]);
    const loadingHtml = renderAnnotations(null, true);
    const errorHtml = renderAnnotations(null, false, "Could not load annotations");

    expect(emptyHtml).toContain("0 total");
    expect(emptyHtml).toContain("No annotations yet.");
    expect(loadingHtml).toContain("Loading");
    expect(loadingHtml).not.toContain("No annotations yet.");
    expect(errorHtml).toContain("Could not load annotations");
    expectReadOnly(emptyHtml + loadingHtml + errorHtml);
  });
});
