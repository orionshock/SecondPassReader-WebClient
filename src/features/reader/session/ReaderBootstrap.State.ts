import type { MarginaliaBootstrap } from "@secondpass/client";
import type { OfflineReaderBootstrap, OpenedBook } from "../Reader.Types";

export type ReaderBootstrapState = {
  serverBootstrap: MarginaliaBootstrap | null;
  localBootstrap: OfflineReaderBootstrap | null;
  sessionId: string | null;
  canMutateSession: boolean;
};

export function getReaderBootstrapState(openedBook: OpenedBook): ReaderBootstrapState {
  if (openedBook.bootstrap.kind === "local") {
    return {
      serverBootstrap: null,
      localBootstrap: openedBook.bootstrap,
      sessionId: null,
      canMutateSession: false,
    };
  }

  const session = openedBook.bootstrap.marginalia.session;
  return {
    serverBootstrap: openedBook.bootstrap.marginalia,
    localBootstrap: null,
    sessionId: session?.id ?? null,
    canMutateSession: session?.status === "active",
  };
}
