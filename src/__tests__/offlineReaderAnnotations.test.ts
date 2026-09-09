import { describe, expect, it } from "vitest";
import { mapOfflineReaderAnnotations } from "../features/reader/session/annotations/OfflineReaderAnnotations.Mapper";

describe("offline Reader annotation projection", () => {
  it("maps present desired state for read-only display and omits tombstones", () => {
    const annotations = mapOfflineReaderAnnotations([
      {
        status: "present",
        origin: { kind: "local-unconfirmed" },
        annotation: {
          clientId: "highlight-1",
          kind: "highlight",
          location: { cfi: "epubcfi(/6/4)", locationLabel: "010% - Chapter" },
          body: { text: "Quoted text", color: "blue" },
        },
      },
      {
        status: "deleted",
        origin: { kind: "server-confirmed", serverSessionId: "server-session" },
        clientId: "deleted-1",
      },
    ]);

    expect(annotations).toEqual([expect.objectContaining({
      id: "local:highlight-1",
      clientId: "highlight-1",
      kind: "highlight",
      location: { cfi: "epubcfi(/6/4)", locationLabel: "010% - Chapter" },
      body: expect.objectContaining({ text: "Quoted text", color: "blue" }),
    })]);
  });
});
