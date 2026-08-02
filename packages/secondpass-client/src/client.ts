import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  SecondPassDiscovery,
} from "./schemas/clientApiAuth";
import type { CurrentUser } from "./schemas/account";
import type { ServerInfo } from "./schemas/server";
import type {
  BookDetail,
  CatalogTag,
  CompactBook,
  Author,
  LibraryGroup,
  Series,
  PaginatedResponse,
} from "./schemas/library";
import type {
  AddShelfItemInput,
  CreateShelfInput,
  PaginatedShelfItemResponse,
  PaginatedShelfResponse,
  Shelf,
  ShelfItem,
  ShelfListParams,
  UpdateShelfInput,
  UpdateShelfItemInput,
} from "./schemas/shelves";
import type {
  MarginaliaAnnotationBatchOperation,
  MarginaliaAnnotationCollection,
  MarginaliaBookSessions,
  MarginaliaBookSummary,
  MarginaliaBootstrap,
  MarginaliaProgress,
  MarginaliaProgressInput,
  MarginaliaRecentSessions,
  MarginaliaSessionDetail,
  MarginaliaSessionFinalizeInput,
  MarginaliaSessionListItem,
  MarginaliaSessionMetadataInput,
  MarginaliaSessionStatus,
} from "./schemas/marginalia";

import { createLoginRequest, discoverSecondPass, pollLoginRequest } from "./clientApiAuthApi";
import { getCurrentUser } from "./accountApi";
import { getServerInfo } from "./serverApi";
import { downloadBookFile, getAuthor, getBook, getGroup, getSeries, getTag, listAuthors, listBooks, listGroupAuthors, listGroupBooks, listGroups, listGroupSeries, listGroupTags, listSeries, listTags, searchBooks } from "./libraryApi";
import {
  batchMarginaliaAnnotations,
  closeMarginaliaSession,
  getActiveMarginaliaSession,
  getMarginaliaAnnotations,
  getMarginaliaBook,
  getMarginaliaProgress,
  getMarginaliaSession,
  listBookSessions,
  listMarginaliaBooks,
  listMarginaliaSessions,
  listRecentMarginaliaSessions,
  openMarginaliaBook,
  replaceMarginaliaProgress,
  startOverMarginaliaBook,
  updateMarginaliaSession,
} from "./marginaliaApi";
import {
  addShelfItem,
  createShelf,
  deleteShelf,
  deleteShelfItem,
  getShelf,
  listShelfItems,
  listShelves,
  updateShelf,
  updateShelfItem,
} from "./shelvesApi";
import { createClientContext, requireAuth } from "./clientContext";

export type SecondPassClientConfig = {
  apiBaseUrl: string;
  accessToken?: string;
  tokenType?: string;
};

export type LibraryBookListParams = {
  q?: string;
  series?: string;
  author?: string;
  tag?: string;
  publisher?: string;
  ordering?: "title" | "-title" | "author" | "-author" | "series" | "-series" | "series_index" | "-series_index" | "publisher" | "-publisher";
  page?: number;
  pageSize?: number;
  excludeGroup?: string;
};

export type LibrarySearchParams = {
  q?: string;
  ordering?: "title" | "-title" | "author" | "-author" | "series" | "-series";
  excludeShelf?: string;
  excludeGroup?: string;
  page?: number;
  pageSize?: number;
};

export type LibraryEntityListParams = {
  q?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
  includePreviewBooks?: boolean;
  previewLimit?: number;
  excludeId?: string;
  ordering?: "name" | "-name" | "book_count" | "-book_count";
};

export type LibraryTagListParams = {
  q?: string;
  ordering?: "name" | "-name" | "book_count" | "-book_count";
  page?: number;
  pageSize?: number;
};

export type LibraryGroupListParams = {
  q?: string;
  ordering?: "name" | "-name";
  page?: number;
  pageSize?: number;
  includePreviewBooks?: boolean;
  previewLimit?: number;
  book?: string;
};

export type LibraryPreviewParams = { includePreviewBooks?: boolean; previewLimit?: number };
export type LibraryGroupBookListParams = LibraryBookListParams & { excludeShelf?: string };
export type LibraryGroupEntityListParams = Omit<LibraryEntityListParams, "excludeId">;

export type SecondPassClient = {
  readonly config: Readonly<SecondPassClientConfig>;

  server: {
    discover(serverBaseUrl: string): Promise<SecondPassDiscovery>;
    info(): Promise<ServerInfo>;
    createLoginRequest(
      discovery: SecondPassDiscovery,
      input?: { clientName?: string; clientType?: string },
    ): Promise<ClientApiLoginRequestResponse>;
    pollLoginRequest(pollUrl: string): Promise<ClientApiPollResponse>;
  };

  account: {
    getCurrentUser(): Promise<CurrentUser>;
  };

  library: {
    search(params?: LibrarySearchParams): Promise<PaginatedResponse<CompactBook>>;
    books: {
      list(params?: LibraryBookListParams): Promise<PaginatedResponse<CompactBook>>;
      get(bookId: string): Promise<BookDetail>;
      /**
       * Returns a server-provided download URL for deliberate URL workflows.
       *
       * Normal app flows should prefer `download()` to avoid passing URLs around.
       */
      getDownloadUrl(book: CompactBook | BookDetail | string | number): Promise<string>;
      /**
       * Download the backing book file bytes (format-neutral).
       *
       * Server convention: 1 book === 1 file.
       */
      download(book: CompactBook | BookDetail | string | number): Promise<Blob>;
    };
    series: {
      list(params?: LibraryEntityListParams): Promise<PaginatedResponse<Series>>;
      get(seriesId: string, params?: LibraryPreviewParams): Promise<Series>;
    };
    authors: {
      list(params?: LibraryEntityListParams): Promise<PaginatedResponse<Author>>;
      get(authorId: string, params?: LibraryPreviewParams): Promise<Author>;
    };
    tags: {
      list(params?: LibraryTagListParams): Promise<PaginatedResponse<CatalogTag>>;
      get(tagId: string): Promise<CatalogTag>;
    };
    groups: {
      list(params?: LibraryGroupListParams): Promise<PaginatedResponse<LibraryGroup>>;
      get(groupId: string, params?: LibraryPreviewParams): Promise<LibraryGroup>;
      books(groupId: string, params?: LibraryGroupBookListParams): Promise<PaginatedResponse<CompactBook>>;
      authors(groupId: string, params?: LibraryGroupEntityListParams): Promise<PaginatedResponse<Author>>;
      series(groupId: string, params?: LibraryGroupEntityListParams): Promise<PaginatedResponse<Series>>;
      tags(groupId: string, params?: LibraryTagListParams): Promise<PaginatedResponse<CatalogTag>>;
    };
  };

  shelves: {
    list(params?: ShelfListParams): Promise<PaginatedShelfResponse>;
    create(input: CreateShelfInput): Promise<Shelf>;
    get(shelfId: string, params?: { includePreviewBooks?: boolean }): Promise<Shelf>;
    update(shelfId: string, input: UpdateShelfInput): Promise<Shelf>;
    remove(shelfId: string): Promise<void>;
    items(shelfId: string, params?: { page?: number; pageSize?: number; ordering?: string }): Promise<PaginatedShelfItemResponse>;
    addItem(shelfId: string, input: AddShelfItemInput): Promise<ShelfItem>;
    updateItem(shelfId: string, itemId: string, input: UpdateShelfItemInput): Promise<ShelfItem>;
    removeItem(shelfId: string, itemId: string): Promise<void>;
  };

  marginalia: {
    books: {
      list(params?: { page?: number; pageSize?: number }): Promise<PaginatedResponse<MarginaliaBookSummary>>;
      get(bookId: string): Promise<MarginaliaBookSummary>;
      sessions(bookId: string, params?: { status?: MarginaliaSessionStatus; q?: string; page?: number; pageSize?: number }): Promise<MarginaliaBookSessions>;
      open(bookId: string, input?: MarginaliaSessionMetadataInput): Promise<MarginaliaBootstrap>;
      getActiveSession(bookId: string): Promise<MarginaliaBootstrap>;
      startOver(bookId: string, input: MarginaliaSessionFinalizeInput | undefined, options: { idempotencyKey: string }): Promise<MarginaliaBootstrap>;
    };
    sessions: {
      list(params?: { status?: MarginaliaSessionStatus; q?: string; hasAnnotations?: boolean; page?: number; pageSize?: number }): Promise<PaginatedResponse<MarginaliaSessionListItem>>;
      recent(params?: { limit?: number; includeClosed?: boolean }): Promise<MarginaliaRecentSessions>;
      get(sessionId: string): Promise<MarginaliaSessionDetail>;
      update(sessionId: string, input: MarginaliaSessionMetadataInput): Promise<MarginaliaSessionDetail>;
      close(sessionId: string, input?: MarginaliaSessionFinalizeInput): Promise<MarginaliaSessionDetail>;
      getProgress(sessionId: string): Promise<{ progress: MarginaliaProgress | null }>;
      replaceProgress(sessionId: string, input: MarginaliaProgressInput): Promise<{ progress: MarginaliaProgress }>;
      getAnnotations(sessionId: string): Promise<MarginaliaAnnotationCollection>;
      batchAnnotations(sessionId: string, operations: MarginaliaAnnotationBatchOperation[]): Promise<MarginaliaAnnotationCollection>;
    };
  };
};

export function createSecondPassClient(config: SecondPassClientConfig): SecondPassClient {
  const frozenConfig = Object.freeze({ ...config });
  const ctx = createClientContext(frozenConfig);

  const getBookDownloadUrl = async (book: CompactBook | BookDetail | string | number): Promise<string> => {
    const auth = requireAuth(ctx);
    const resolved =
      typeof book === "string" || typeof book === "number" || "fileFormat" in book
        ? await getBook(auth, String(typeof book === "object" ? book.id : book))
        : book;
    const url = resolved.file?.downloadUrl ?? null;
    if (!url) throw new Error("Server returned a book without a file download URL.");
    return url;
  };

  const downloadBookBlob = async (book: CompactBook | BookDetail | string | number): Promise<Blob> => {
    const auth = requireAuth(ctx);
    const bookId = typeof book === "string" || typeof book === "number" ? String(book) : String(book.id);
    const dl = await downloadBookFile(auth, bookId);
    return dl.blob;
  };

  return {
    config: frozenConfig,

    server: {
      discover: (serverBaseUrl: string) => discoverSecondPass(serverBaseUrl),
      info: () => {
        const auth = requireAuth(ctx);
        return getServerInfo(auth);
      },
      createLoginRequest: (discovery: SecondPassDiscovery, input?: { clientName?: string; clientType?: string }) =>
        createLoginRequest(discovery, input, frozenConfig.accessToken ? frozenConfig.accessToken : null),
      pollLoginRequest: (pollUrl: string) => pollLoginRequest(pollUrl, frozenConfig.accessToken ? frozenConfig.accessToken : null),
    },

    account: {
      getCurrentUser: () => {
        const auth = requireAuth(ctx);
        return getCurrentUser(auth);
      },
    },

    library: {
      search: (params) => {
        const auth = requireAuth(ctx);
        return searchBooks(auth, params);
      },
      books: {
        list: (params) => {
          const auth = requireAuth(ctx);
          return listBooks(auth, params);
        },
        get: (bookId) => {
          const auth = requireAuth(ctx);
          return getBook(auth, bookId);
        },
        getDownloadUrl: async (book) => {
          return getBookDownloadUrl(book);
        },
        download: async (book) => {
          return downloadBookBlob(book);
        },
      },

      series: {
        list: (params) => {
          const auth = requireAuth(ctx);
          return listSeries(auth, {
            q: params?.q,
            tag: params?.tag,
            page: params?.page,
            pageSize: params?.pageSize,
            includePreviewBooks: params?.includePreviewBooks,
            previewLimit: params?.previewLimit,
            excludeId: params?.excludeId,
            ordering: params?.ordering,
          });
        },
        get: (seriesId, params) => {
          const auth = requireAuth(ctx);
          return getSeries(auth, seriesId, params);
        },
      },

      authors: {
        list: (params) => {
          const auth = requireAuth(ctx);
          return listAuthors(auth, {
            q: params?.q,
            tag: params?.tag,
            page: params?.page,
            pageSize: params?.pageSize,
            includePreviewBooks: params?.includePreviewBooks,
            previewLimit: params?.previewLimit,
            excludeId: params?.excludeId,
            ordering: params?.ordering,
          });
        },
        get: (authorId, params) => {
          const auth = requireAuth(ctx);
          return getAuthor(auth, authorId, params);
        },
      },

      tags: {
        list: (params) => {
          const auth = requireAuth(ctx);
          return listTags(auth, params);
        },
        get: (tagId) => {
          const auth = requireAuth(ctx);
          return getTag(auth, tagId);
        },
      },

      groups: {
        list: (params) => {
          const auth = requireAuth(ctx);
          return listGroups(auth, {
            q: params?.q,
            page: params?.page,
            pageSize: params?.pageSize,
            includePreviewBooks: params?.includePreviewBooks,
            previewLimit: params?.previewLimit,
            book: params?.book,
            ordering: params?.ordering,
          });
        },
        get: (groupId, params) => {
          const auth = requireAuth(ctx);
          return getGroup(auth, groupId, params);
        },
        books: (groupId, params) => {
          const auth = requireAuth(ctx);
          return listGroupBooks(auth, groupId, params);
        },
        authors: (groupId, params) => {
          const auth = requireAuth(ctx);
          return listGroupAuthors(auth, groupId, params);
        },
        series: (groupId, params) => {
          const auth = requireAuth(ctx);
          return listGroupSeries(auth, groupId, params);
        },
        tags: (groupId, params) => {
          const auth = requireAuth(ctx);
          return listGroupTags(auth, groupId, params);
        },
      },
    },

    shelves: {
      list: (params) => {
        const auth = requireAuth(ctx);
        return listShelves(auth, params);
      },
      create: (input) => {
        const auth = requireAuth(ctx);
        return createShelf(auth, input);
      },
      get: (shelfId, params) => {
        const auth = requireAuth(ctx);
        return getShelf(auth, { shelfId, includePreviewBooks: params?.includePreviewBooks });
      },
      update: (shelfId, input) => {
        const auth = requireAuth(ctx);
        return updateShelf(auth, { shelfId, update: input });
      },
      remove: (shelfId) => {
        const auth = requireAuth(ctx);
        return deleteShelf(auth, { shelfId });
      },
      items: (shelfId, params) => {
        const auth = requireAuth(ctx);
        return listShelfItems(auth, { shelfId, page: params?.page, pageSize: params?.pageSize, ordering: params?.ordering });
      },
      addItem: (shelfId, input) => {
        const auth = requireAuth(ctx);
        return addShelfItem(auth, { shelfId, item: input });
      },
      updateItem: (shelfId, itemId, input) => {
        const auth = requireAuth(ctx);
        return updateShelfItem(auth, { shelfId, itemId, update: input });
      },
      removeItem: (shelfId, itemId) => {
        const auth = requireAuth(ctx);
        return deleteShelfItem(auth, { shelfId, itemId });
      },
    },

    marginalia: {
      books: {
        list: (params) => listMarginaliaBooks(requireAuth(ctx), params),
        get: (bookId) => getMarginaliaBook(requireAuth(ctx), bookId),
        sessions: (bookId, params) => listBookSessions(requireAuth(ctx), bookId, params),
        open: (bookId, input) => openMarginaliaBook(requireAuth(ctx), bookId, input),
        getActiveSession: (bookId) => getActiveMarginaliaSession(requireAuth(ctx), bookId),
        startOver: (bookId, input, options) => startOverMarginaliaBook(requireAuth(ctx), bookId, input, options.idempotencyKey),
      },
      sessions: {
        list: (params) => listMarginaliaSessions(requireAuth(ctx), params),
        recent: (params) => listRecentMarginaliaSessions(requireAuth(ctx), params),
        get: (sessionId) => getMarginaliaSession(requireAuth(ctx), sessionId),
        update: (sessionId, input) => updateMarginaliaSession(requireAuth(ctx), sessionId, input),
        close: (sessionId, input) => closeMarginaliaSession(requireAuth(ctx), sessionId, input),
        getProgress: (sessionId) => getMarginaliaProgress(requireAuth(ctx), sessionId),
        replaceProgress: (sessionId, input) => replaceMarginaliaProgress(requireAuth(ctx), sessionId, input),
        getAnnotations: (sessionId) => getMarginaliaAnnotations(requireAuth(ctx), sessionId),
        batchAnnotations: (sessionId, operations) => batchMarginaliaAnnotations(requireAuth(ctx), sessionId, operations),
      },
    },
  };
}
