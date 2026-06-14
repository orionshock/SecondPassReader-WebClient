import { describe, expect, it, vi } from "vitest";

import {
  buildLayerLabelParts,
  getPreviousSessionHighlightCount,
  sortPreviousSessionSummariesByUpdatedAt,
  stripPreviousSessionUpdatedAt,
  toPreviousSessionAnnotationGroup,
  toPreviousSessionLayerSummary,
  toPreviousSessionSummary,
} from "../features/reader/session/previousSessionViewModels";

describe("previousSessionViewModels", () => {
  it("formats session time labels and strips helper updatedAt metadata", () => {
    vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("Jan 1, 2024, 12:00 PM");

    const summary = toPreviousSessionSummary({
      id: "session-a",
      name: "Notes pass",
      annotation_count: 3,
      updated_at: "2024-01-01T12:00:00.000Z",
    });

    expect(summary).toEqual({
      sessionId: "session-a",
      timeLabel: "Jan 1, 2024, 12:00 PM",
      name: "Notes pass",
      annotationCount: 3,
      updatedAt: "2024-01-01T12:00:00.000Z",
    });
    expect(stripPreviousSessionUpdatedAt(summary)).toEqual({
      sessionId: "session-a",
      timeLabel: "Jan 1, 2024, 12:00 PM",
      name: "Notes pass",
      annotationCount: 3,
    });
  });

  it("sorts previous sessions by updated timestamp descending", () => {
    const sorted = sortPreviousSessionSummariesByUpdatedAt([
      { sessionId: "old", timeLabel: "old", name: null, annotationCount: 1, updatedAt: "2024-01-01T00:00:00.000Z" },
      { sessionId: "new", timeLabel: "new", name: null, annotationCount: 1, updatedAt: "2024-01-02T00:00:00.000Z" },
    ]);

    expect(sorted.map((item) => item.sessionId)).toEqual(["new", "old"]);
  });

  it("builds layer labels and chooses cached highlight counts first", () => {
    expect(buildLayerLabelParts({ name: "  Session name  ", timeLabel: "Today", highlightCount: 1 })).toEqual([
      "Session name",
      "Today",
      "1 highlight",
    ]);
    expect(buildLayerLabelParts({ name: "", timeLabel: "Today", highlightCount: 2 })).toEqual([
      "Today",
      "2 highlights",
    ]);
    expect(getPreviousSessionHighlightCount({ cachedHighlightCount: 4, annotationCount: 2 })).toBe(4);
    expect(getPreviousSessionHighlightCount({ annotationCount: 2 })).toBe(2);
  });

  it("creates previous layer and group view models", () => {
    const summary = { sessionId: "session-a", timeLabel: "Today", name: "Session name", annotationCount: 2 };

    expect(toPreviousSessionLayerSummary({ summary, highlightCount: 2, status: "ready" })).toEqual({
      sessionId: "session-a",
      label: "Session name Today 2 highlights",
      labelParts: ["Session name", "Today", "2 highlights"],
      highlightCount: 2,
      status: "ready",
      error: undefined,
    });

    expect(toPreviousSessionAnnotationGroup({ summary, highlightCount: 2, selected: true, status: "ready", items: [] })).toEqual({
      sessionId: "session-a",
      label: "Session name Today 2 highlights",
      labelParts: ["Session name", "Today", "2 highlights"],
      highlightCount: 2,
      selected: true,
      status: "ready",
      error: undefined,
      items: [],
    });
  });
});
