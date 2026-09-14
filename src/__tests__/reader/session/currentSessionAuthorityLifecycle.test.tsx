// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarginaliaAnnotation } from "@secondpass/client";
import type { OfflineReaderBootstrap } from "../../../features/reader/Reader.Types";

const owners = vi.hoisted(() => ({
  onlineProgress: vi.fn(() => ({
    autosave: { status: "idle" },
    prepareProgressForClose: vi.fn(async () => undefined),
    resumeProgressAfterCloseFailure: vi.fn(),
  })),
  offlineProgress: vi.fn(() => ({ status: "idle", dirty: false })),
  onlineAnnotations: vi.fn(() => annotationOwner()),
  offlineAnnotations: vi.fn(() => ({ ...annotationOwner(), canMutate: true })),
}));

vi.mock("../../../features/reader/session/progress/ReadingProgressAutosave.Lifecycle", () => ({
  useReadingProgressAutosave: owners.onlineProgress,
}));
vi.mock("../../../features/reader/session/progress/OfflineReadingProgress.Lifecycle", () => ({
  useOfflineReadingProgress: owners.offlineProgress,
}));
vi.mock("../../../features/reader/session/annotations/CurrentSessionAnnotation.Actions", () => ({
  useCurrentSessionAnnotationActions: owners.onlineAnnotations,
}));
vi.mock("../../../features/reader/session/annotations/OfflineCurrentSessionAnnotation.Lifecycle", () => ({
  useOfflineCurrentSessionAnnotations: owners.offlineAnnotations,
}));

import { useCurrentSessionAuthority } from "../../../features/reader/session/CurrentSessionAuthority.Controller";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

describe("current Reading Session authority lifecycle", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps both hooks mounted while enabling progress and mutations for one authority", async () => {
    let observed!: ReturnType<typeof useCurrentSessionAuthority>;
    await render(null, true);

    expect(owners.onlineProgress).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
    expect(owners.offlineProgress).toHaveBeenLastCalledWith(expect.objectContaining({ bootstrap: null }));
    expect(observed.authority.mode).toBe("server");

    const local = localBootstrap();
    await render(local, false);

    expect(owners.onlineProgress).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    expect(owners.offlineProgress).toHaveBeenLastCalledWith(expect.objectContaining({ bootstrap: local }));
    expect(observed.authority.mode).toBe("local");
    await observed.authority.annotations?.createHighlight({
      selection: { cfiRange: "epubcfi(/6/4)", text: "Text" },
      color: "yellow",
    });
    expect(owners.offlineAnnotations.mock.results.at(-1)?.value.createHighlight).toHaveBeenCalledOnce();
    expect(owners.onlineAnnotations.mock.results.at(-1)?.value.createHighlight).not.toHaveBeenCalled();

    async function render(localBootstrapValue: OfflineReaderBootstrap | null, serverSessionWritable: boolean) {
      await act(async () => root.render(
        <Harness
          localBootstrap={localBootstrapValue}
          serverSessionWritable={serverSessionWritable}
          onValue={(value) => { observed = value; }}
        />,
      ));
    }
  });
});

function Harness({
  localBootstrap,
  serverSessionWritable,
  onValue,
}: {
  localBootstrap: OfflineReaderBootstrap | null;
  serverSessionWritable: boolean;
  onValue: (value: ReturnType<typeof useCurrentSessionAuthority>) => void;
}) {
  const [annotations, setAnnotations] = useState<MarginaliaAnnotation[]>([]);
  const value = useCurrentSessionAuthority({
    activeBookKey: "book-1|blob:book-1",
    serverClient: null,
    serverSessionId: "session-1",
    serverSessionWritable,
    localBootstrap,
    location: { cfi: "epubcfi(/6/4)", bookProgress: 0.2 },
    toc: null,
    bookTitle: "Book",
    currentBookmark: null,
    annotationsRaw: annotations,
    setAnnotationsRaw: setAnnotations,
    setAnnotationError: () => undefined,
  });
  onValue(value);
  return null;
}

function annotationOwner() {
  return {
    annotationBusy: false,
    toggleBookmarkAtCurrentLocation: vi.fn(async () => ({ ok: true as const, action: "created" as const })),
    createHighlight: vi.fn(async () => undefined),
    removeById: vi.fn(async () => undefined),
    updateHighlight: vi.fn(async () => undefined),
  };
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
