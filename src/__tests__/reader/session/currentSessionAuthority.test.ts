import { describe, expect, it, vi } from "vitest";
import type { OfflineReaderBootstrap } from "../../../features/reader/Reader.Types";
import {
  selectCurrentSessionAuthority,
  type CurrentSessionAnnotationCapability,
} from "../../../features/reader/session/CurrentSessionAuthority.Controller";

describe("current Reading Session authority", () => {
  it("selects the server owner for a writable online Reading Session", async () => {
    const server = annotationOwner();
    const local = offlineAnnotationOwner(false);

    const authority = selectCurrentSessionAuthority({
      serverSessionId: "session-1",
      serverSessionWritable: true,
      serverProgressStatus: "pending",
      localBootstrap: null,
      localProgressStatus: "idle",
      onlineAnnotations: server,
      offlineAnnotations: local,
    });

    expect(authority).toMatchObject({
      mode: "server",
      identity: "session-1",
      status: "writable",
      progress: { mode: "server", status: "pending" },
    });
    await authority.annotations?.createHighlight(highlightInput());
    expect(server.createHighlight).toHaveBeenCalledOnce();
    expect(local.createHighlight).not.toHaveBeenCalled();
  });

  it("selects local-first mutation and progress owners for an offline-open Reader", async () => {
    const server = annotationOwner();
    const local = offlineAnnotationOwner(true);

    const authority = selectCurrentSessionAuthority({
      serverSessionId: null,
      serverSessionWritable: false,
      serverProgressStatus: "idle",
      localBootstrap: localBootstrap(),
      localProgressStatus: "saving",
      onlineAnnotations: server,
      offlineAnnotations: local,
    });

    expect(authority).toMatchObject({
      mode: "local",
      identity: "local:test",
      status: "writable",
      progress: { mode: "local", status: "saving" },
    });
    await authority.annotations?.createHighlight(highlightInput());
    expect(local.createHighlight).toHaveBeenCalledOnce();
    expect(server.createHighlight).not.toHaveBeenCalled();
  });

  it("keeps local-first authority after handoff even when server writability returns", () => {
    const authority = selectCurrentSessionAuthority({
      serverSessionId: "session-1",
      serverSessionWritable: true,
      serverProgressStatus: "pending",
      localBootstrap: localBootstrap(),
      localProgressStatus: "saved",
      onlineAnnotations: annotationOwner(),
      offlineAnnotations: offlineAnnotationOwner(true),
    });

    expect(authority).toMatchObject({ mode: "local", progress: { mode: "local" } });
  });

  it("exposes no mutation capability while local authority initializes or is read-only", () => {
    const initializing = selectCurrentSessionAuthority({
      serverSessionId: null,
      serverSessionWritable: false,
      serverProgressStatus: "idle",
      localBootstrap: localBootstrap(),
      localProgressStatus: "idle",
      onlineAnnotations: annotationOwner(),
      offlineAnnotations: offlineAnnotationOwner(false),
    });
    const closedBootstrap = localBootstrap();
    closedBootstrap.continuity.session = {
      kind: "server-confirmed",
      localSessionId: "local:test",
      serverSessionId: "session-1",
      lastKnownServerStatus: "closed",
    };
    const readOnly = selectCurrentSessionAuthority({
      serverSessionId: "session-1",
      serverSessionWritable: false,
      serverProgressStatus: "idle",
      localBootstrap: closedBootstrap,
      localProgressStatus: "idle",
      onlineAnnotations: annotationOwner(),
      offlineAnnotations: offlineAnnotationOwner(false),
    });

    expect(initializing).toMatchObject({ mode: "local", status: "initializing", annotations: null });
    expect(readOnly).toMatchObject({ mode: "local", status: "read-only", annotations: null });
  });

  it("models a missing current Reading Session as unavailable", () => {
    const authority = selectCurrentSessionAuthority({
      serverSessionId: null,
      serverSessionWritable: false,
      serverProgressStatus: "idle",
      localBootstrap: null,
      localProgressStatus: "idle",
      onlineAnnotations: annotationOwner(),
      offlineAnnotations: offlineAnnotationOwner(false),
    });

    expect(authority).toEqual({
      mode: "unavailable",
      identity: null,
      status: "missing-session",
      writable: false,
      annotations: null,
      progress: null,
    });
  });
});

function annotationOwner(): Omit<CurrentSessionAnnotationCapability, "busy"> & { annotationBusy: boolean } {
  return {
    annotationBusy: false,
    toggleBookmarkAtCurrentLocation: vi.fn(async () => ({ ok: true as const, action: "created" as const })),
    createHighlight: vi.fn(async () => undefined),
    removeById: vi.fn(async () => undefined),
    updateHighlight: vi.fn(async () => undefined),
  };
}

function offlineAnnotationOwner(canMutate: boolean) {
  return { ...annotationOwner(), canMutate };
}

function highlightInput() {
  return { selection: { cfiRange: "epubcfi(/6/4)", text: "Text" }, color: "yellow" };
}

function localBootstrap(): OfflineReaderBootstrap {
  return {
    kind: "local",
    serverWritesAllowed: false,
    continuity: {
      annotationRevision: 0,
      namespaceKey: "account-a",
      bookId: "book-1",
      schemaVersion: 1,
      session: {
        kind: "provisional",
        localSessionId: "local:test",
        serverSessionId: null,
        lastKnownServerStatus: null,
      },
      progress: null,
      annotations: [],
    },
  };
}
