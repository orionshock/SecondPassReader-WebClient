import { describe, expect, it } from "vitest";
import type { MarginaliaBootstrap } from "@secondpass/client";
import { getReaderBootstrapState } from "../../../features/reader/session/ReaderBootstrap.State";
import type { OpenedBook } from "../../../features/reader/Reader.Types";

describe("Reader bootstrap authority", () => {
  it("retains active server authority for the online bootstrap", () => {
    const state = getReaderBootstrapState(onlineBook("active"));

    expect(state.sessionId).toBe("server-session");
    expect(state.canMutateSession).toBe(true);
    expect(state.serverBootstrap).not.toBeNull();
  });

  it.each(["active", "closed"] as const)(
    "never exposes a local bootstrap's %s remembered server Session to mutation owners",
    (lastKnownStatus) => {
      const state = getReaderBootstrapState(offlineBook(lastKnownStatus));

      expect(state.sessionId).toBeNull();
      expect(state.canMutateSession).toBe(false);
      expect(state.serverBootstrap).toBeNull();
      expect(state.localBootstrap?.continuity.session.serverSessionId).toBe("remembered-session");
    },
  );
});

function onlineBook(status: "active" | "closed"): OpenedBook {
  return {
    ...baseBook(),
    source: "online",
    bootstrap: {
      kind: "server",
      marginalia: {
        session: { id: "server-session", status } as never,
      } as unknown as MarginaliaBootstrap,
    },
  };
}

function offlineBook(lastKnownServerStatus: "active" | "closed"): OpenedBook {
  return {
    ...baseBook(),
    source: "offline",
    bootstrap: {
      kind: "local",
      serverWritesAllowed: false,
      continuity: {
        namespaceKey: "account-a",
        bookId: "book-1",
        schemaVersion: 1,
        session: {
          kind: "server-confirmed",
          localSessionId: "local:remembered",
          serverSessionId: "remembered-session",
          lastKnownServerStatus,
        },
        progress: null,
        annotations: [],
      },
    },
  };
}

function baseBook() {
  return {
    book: { id: "book-1", title: "Book" } as OpenedBook["book"],
    blob: new Blob(["book"]),
    objectUrl: "blob:book",
    openedAt: "2026-01-01T00:00:00Z",
    returnTarget: { kind: "home" as const, label: "Home", route: "#/home" },
  };
}
