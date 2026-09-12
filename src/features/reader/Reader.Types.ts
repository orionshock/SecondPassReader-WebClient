import type { BookDetail, CompactBook, MarginaliaBootstrap } from "@secondpass/client";
import type { OfflineReaderBookState } from "../../app/offline/storage/OfflineRepositories.Types";

export type ReaderReturnTarget = {
  kind: "home" | "library" | "shelves" | "shelf" | "sessions" | "bookDetail" | "series";
  label: string;
  route: string;
  bookId?: string;
  shelfId?: string;
  sessionId?: string;
  seriesId?: string;
};

type OpenedBookBase = {
  book: CompactBook | BookDetail;
  blob: Blob;
  objectUrl: string;
  openedAt: string;
  returnTarget: ReaderReturnTarget;
};

export type OnlineOpenedBook = OpenedBookBase & {
  source: "online";
  bootstrap: {
    kind: "server";
    marginalia: MarginaliaBootstrap;
  };
};

export type OfflineReaderBootstrap = {
  kind: "local";
  continuity: OfflineReaderBookState;
  serverWritesAllowed: false;
  suppressInitialProgressWrite?: boolean;
};

export type OfflineOpenedBook = OpenedBookBase & {
  source: "offline";
  bootstrap: OfflineReaderBootstrap;
};

export type OpenedBook = OnlineOpenedBook | OfflineOpenedBook;
