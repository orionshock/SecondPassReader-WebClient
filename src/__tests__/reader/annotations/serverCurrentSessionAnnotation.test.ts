import type { SecondPassClient } from "@secondpass/client";
import { describe, expect, it, vi } from "vitest";
import { commitServerCurrentSessionAnnotation } from "../../../features/reader/session/annotations/ServerCurrentSessionAnnotation.Adapter";
import { buildBookmarkUpsert, buildHighlightUpsert } from "../../../features/reader/session/ReadingSessionMarginalia.Actions";

describe("server current-session annotation authority", () => {
  it.each([
    buildBookmarkUpsert({ clientId: "bookmark", cfi: "epubcfi(/6/4!/4/2/1:2)" }),
    buildHighlightUpsert({ clientId: "highlight", cfi: "epubcfi(/6/4!/4/2,/1:2,/1:7)", text: "  Text\n", color: "blue", note: "Note" }),
    { action: "delete" as const, clientId: "annotation" },
  ])("delivers canonical $action intent and returns the authoritative response", async (mutation) => {
    const response = { annotations: [] };
    const batchAnnotations = vi.fn().mockResolvedValue(response);
    const client = { marginalia: { sessions: { batchAnnotations } } } as unknown as SecondPassClient;
    expect(await commitServerCurrentSessionAnnotation(client, "session-1", mutation)).toBe(response);
    expect(batchAnnotations).toHaveBeenCalledExactlyOnceWith("session-1", [mutation]);
  });

  it.each([null, "", "local:provisional"])("rejects invalid server authority %s before invoking the SDK", (sessionId) => {
    const batchAnnotations = vi.fn();
    const client = { marginalia: { sessions: { batchAnnotations } } } as unknown as SecondPassClient;
    expect(() => commitServerCurrentSessionAnnotation(client, sessionId, { action: "delete", clientId: "annotation" })).toThrow(/authority/);
    expect(batchAnnotations).not.toHaveBeenCalled();
  });
});
