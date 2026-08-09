import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import { SessionDetailAnnotationsList } from "../features/sessions/SessionDetailAnnotationsList";

describe("SessionDetailAnnotationsList", () => {
  it("uses shared annotation presentation without exposing edit actions", () => {
    const annotations: MarginaliaAnnotation[] = [{
      id: "highlight-1",
      clientId: "client-1",
      kind: "highlight",
      location: { cfi: "epubcfi(/6/2,/4,/8)", locationLabel: "Chapter 01" },
      body: {
        text: "Quoted text",
        prefix: "",
        suffix: "",
        color: "yellow",
        note: "Reader note",
      },
      createdAt: "2026-08-09T00:00:00Z",
      updatedAt: "2026-08-09T00:00:00Z",
    }];

    const html = renderToStaticMarkup(createElement(SessionDetailAnnotationsList, {
      annotations,
      annoBusy: false,
      annoError: null,
    }));

    expect(html).toContain("Quoted text");
    expect(html).toContain("Reader note");
    expect(html).toContain("--annotation-color:rgba(250, 204, 21, 0.55)");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Edit note and color");
    expect(html).not.toContain("Delete highlight");
  });
});
