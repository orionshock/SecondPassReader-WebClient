import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  MePayload,
  SecondPassDiscovery,
} from "./schemas/clientApiAuth";
import type {
  LibraryAuthor,
  LibraryBook,
  LibrarySeries,
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
  ReadingAnnotation,
  ReadingAnnotationBatchCreatePayload,
  ReadingAnnotationBatchCreateResponse,
  ReadingAnnotationPage,
  ReadingOpenResponse,
  ReadingBookActivitySummaryResponse,
  ReadingProgress,
  ReadingRecentSessionsResponse,
  ReadingSessionsListResponse,
  ReadingSession,
  ReadingSessionSummary,
} from "./schemas/readingSession";

import { createLoginRequest, discoverSecondPass, getMe, pollLoginRequest } from "./clientApiAuthApi";
import { downloadBookFile, getAuthor, getBook, getSeries, listAuthors, listBooks, listSeries } from "./libraryApi";
import {
  closeReadingSession,
  getReadingBookActivitySummary,
  getReadingSession,
  listReadingSessions,
  listRecentReadingSessions,
  openReadingSession,
  startOverReadingSession,
  updateReadingSession,
} from "./readingSessionsApi";
import {
  batchCreateReadingAnnotations,
  createBookmarkAnnotation,
  createHighlightAnnotation,
  deleteReadingAnnotation,
  listReadingAnnotations,
  updateNoteAnnotation,
} from "./readingAnnotationsApi";
import { saveReadingProgress } from "./readingProgressApi";
import type {
  CreateBookmarkInput,
  CreateHighlightInput,
  ListReadingAnnotationsInput,
  UpdateNoteInput,
} from "./readingAnnotationsApi";
import type { SaveReadingProgressInput } from "./readingProgressApi";

export type {
  CreateBookmarkInput,
  CreateHighlightInput,
  ListReadingAnnotationsInput,
  ReadingAnnotationsOrdering,
  ReadingAnnotationKind,
  UpdateNoteInput,
} from "./readingAnnotationsApi";
export type { ReadingAnnotationBatchCreatePayload, ReadingAnnotationBatchCreateResponse } from "./schemas/readingSession";
export type { SaveReadingProgressInput } from "./readingProgressApi";
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
  hasFiles?: boolean;
  series?: string | number;
  author?: string | number;
  ordering?: string;
  page?: number;
  pageSize?: number;
};

export type LibraryEntityListParams = {
  page?: number;
  includePreviewBooks?: boolean;
};

export type SecondPassClient = {
  readonly config: Readonly<SecondPassClientConfig>;

  server: {
    discover(serverBaseUrl: string): Promise<SecondPassDiscovery>;
    createLoginRequest(
      discovery: SecondPassDiscovery,
      input?: { clientName?: string; clientType?: string },
    ): Promise<ClientApiLoginRequestResponse>;
    pollLoginRequest(pollUrl: string): Promise<ClientApiPollResponse>;
  };

  account: {
    getCurrent(): Promise<MePayload>;
  };

  library: {
    books: {
      list(params?: LibraryBookListParams): Promise<PaginatedResponse<LibraryBook>>;
      get(bookId: string): Promise<LibraryBook>;
      /**
       * Returns a server-provided download URL for deliberate URL workflows.
       *
       * Normal app flows should prefer `download()` to avoid passing URLs around.
       */
      getDownloadUrl(book: LibraryBook | string | number): Promise<string>;
      /**
       * Download the backing book file bytes (format-neutral).
       *
       * Server convention: 1 book === 1 file.
       */
      download(book: LibraryBook | string | number): Promise<Blob>;
    };
    series: {
      list(params?: LibraryEntityListParams): Promise<PaginatedResponse<LibrarySeries>>;
      get(seriesId: string, params?: { includePreviewBooks?: boolean }): Promise<LibrarySeries>;
      books(seriesId: string, params?: Omit<LibraryBookListParams, "series">): Promise<PaginatedResponse<LibraryBook>>;
    };
    authors: {
      list(params?: LibraryEntityListParams): Promise<PaginatedResponse<LibraryAuthor>>;
      get(authorId: string, params?: { includePreviewBooks?: boolean }): Promise<LibraryAuthor>;
      books(authorId: string, params?: Omit<LibraryBookListParams, "author">): Promise<PaginatedResponse<LibraryBook>>;
    };
  };

  shelves: {
    list(params?: ShelfListParams): Promise<PaginatedShelfResponse>;
    create(input: CreateShelfInput): Promise<Shelf>;
    get(shelfId: string, params?: { includePreviewBooks?: boolean }): Promise<Shelf>;
    update(shelfId: string, input: UpdateShelfInput): Promise<Shelf>;
    remove(shelfId: string): Promise<void>;
    items(shelfId: string, params?: { page?: number }): Promise<PaginatedShelfItemResponse>;
    addItem(shelfId: string, input: AddShelfItemInput): Promise<ShelfItem>;
    updateItem(shelfId: string, itemId: string, input: UpdateShelfItemInput): Promise<ShelfItem>;
    removeItem(shelfId: string, itemId: string): Promise<void>;
  };

  reading: {
    openForReading(book: LibraryBook | string | number): Promise<{ open: ReadingOpenResponse; blob: Blob }>;

    books: {
      activitySummary(input: { books: Array<string | number> }): Promise<ReadingBookActivitySummaryResponse>;
    };

    sessions: {
      open(bookId: string | number): Promise<ReadingOpenResponse>;
      startOver(bookId: string | number): Promise<ReadingOpenResponse>;
      recent(params?: { limit?: number }): Promise<ReadingRecentSessionsResponse>;
      list(params?: {
        page?: number;
        pageSize?: number;
        bookId?: string | number;
        status?: "active" | "completed" | "archived" | string;
        isActive?: boolean;
        q?: string;
      }): Promise<ReadingSessionsListResponse>;
      get(sessionId: string): Promise<ReadingSessionSummary>;
      updateDetails(sessionId: string, input: { name?: string; notes?: string }): Promise<ReadingSessionSummary>;
      close(sessionId: string): Promise<ReadingSession>;
    };

    progress: {
      /**
       * Save reading progress (high-level helper).
       *
       * Hides wire-format field names and uses PATCH internally.
       */
      save(sessionId: string, progress: SaveReadingProgressInput): Promise<ReadingProgress>;
    };

    annotations: {
      list(params: ListReadingAnnotationsInput): Promise<ReadingAnnotationPage>;
      createHighlight(input: CreateHighlightInput, options?: { idempotencyKey?: string }): Promise<ReadingAnnotation>;
      createBookmark(input: CreateBookmarkInput, options?: { idempotencyKey?: string }): Promise<ReadingAnnotation>;
      batchCreate(
        input: ReadingAnnotationBatchCreatePayload,
      ): Promise<ReadingAnnotationBatchCreateResponse>;
      updateNote(annotationId: string, input: UpdateNoteInput): Promise<ReadingAnnotation>;
      remove(annotationId: string): Promise<void>;
    };
  };
};

export function createSecondPassClient(config: SecondPassClientConfig): SecondPassClient {
  const frozenConfig = Object.freeze({ ...config });
  const ctx = createClientContext(frozenConfig);

  const getBookDownloadUrl = async (book: LibraryBook | string | number): Promise<string> => {
    const auth = requireAuth(ctx);
    const resolved =
      typeof book === "string" || typeof book === "number"
        ? await getBook(auth, { bookId: String(book) })
        : book;
    const url = resolved.file?.download_url ?? null;
    if (!url) throw new Error("Server returned a book without a file download URL.");
    return url;
  };

  const downloadBookBlob = async (book: LibraryBook | string | number): Promise<Blob> => {
    const auth = requireAuth(ctx);
    const url = await getBookDownloadUrl(book);
    const dl = await downloadBookFile(auth, { downloadUrl: url });
    return dl.blob;
  };

  return {
    config: frozenConfig,

    server: {
      discover: (serverBaseUrl: string) => discoverSecondPass(serverBaseUrl),
      createLoginRequest: (discovery: SecondPassDiscovery, input?: { clientName?: string; clientType?: string }) =>
        createLoginRequest(discovery, input, frozenConfig.accessToken ? frozenConfig.accessToken : null),
      pollLoginRequest: (pollUrl: string) => pollLoginRequest(pollUrl, frozenConfig.accessToken ? frozenConfig.accessToken : null),
    },

    account: {
      getCurrent: () => {
        const auth = requireAuth(ctx);
        return getMe(auth);
      },
    },

    library: {
      books: {
        list: (params) => {
          const auth = requireAuth(ctx);
          return listBooks(auth, { params });
        },
        get: (bookId) => {
          const auth = requireAuth(ctx);
          return getBook(auth, { bookId });
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
            page: params?.page,
            includePreviewBooks: params?.includePreviewBooks,
          });
        },
        get: (seriesId, params) => {
          const auth = requireAuth(ctx);
          return getSeries(auth, { seriesId, includePreviewBooks: params?.includePreviewBooks });
        },
        books: (seriesId, params) => {
          const auth = requireAuth(ctx);
          return listBooks(auth, { params: { ...params, series: seriesId } });
        },
      },

      authors: {
        list: (params) => {
          const auth = requireAuth(ctx);
          return listAuthors(auth, {
            page: params?.page,
            includePreviewBooks: params?.includePreviewBooks,
          });
        },
        get: (authorId, params) => {
          const auth = requireAuth(ctx);
          return getAuthor(auth, { authorId, includePreviewBooks: params?.includePreviewBooks });
        },
        books: (authorId, params) => {
          const auth = requireAuth(ctx);
          return listBooks(auth, { params: { ...params, author: authorId } });
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
        return listShelfItems(auth, { shelfId, page: params?.page });
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

    reading: {
      openForReading: async (book) => {
        const auth = requireAuth(ctx);
        const resolved =
          typeof book === "string" || typeof book === "number"
            ? await getBook(auth, { bookId: String(book) })
            : book;
        const open = await openReadingSession(auth, { bookId: resolved.id });
        const blob = await downloadBookBlob(resolved);
        return { open, blob };
      },

      books: {
        activitySummary: (input) => {
          const auth = requireAuth(ctx);
          return getReadingBookActivitySummary(auth, input);
        },
      },

      sessions: {
        open: (bookId) => {
          const auth = requireAuth(ctx);
          return openReadingSession(auth, { bookId });
        },
        startOver: (bookId) => {
          const auth = requireAuth(ctx);
          return startOverReadingSession(auth, { bookId });
        },
        recent: (params) => {
          const auth = requireAuth(ctx);
          return listRecentReadingSessions(auth, { limit: params?.limit });
        },
        list: (params) => {
          const auth = requireAuth(ctx);
          return listReadingSessions({ ctx: auth, ...params });
        },
        get: (sessionId) => {
          const auth = requireAuth(ctx);
          return getReadingSession({ ctx: auth, sessionId });
        },
        updateDetails: (sessionId, payload) => {
          const auth = requireAuth(ctx);
          return updateReadingSession(auth, { sessionId, payload });
        },
        close: (sessionId) => {
          const auth = requireAuth(ctx);
          return closeReadingSession(auth, { sessionId });
        },
      },

      progress: {
        save: (sessionId, progress) => {
          const auth = requireAuth(ctx);
          return saveReadingProgress({ ctx: auth, sessionId, progress });
        },
      },

      annotations: {
        list: (params) => {
          const auth = requireAuth(ctx);
          return listReadingAnnotations({ ctx: auth, params });
        },
        createHighlight: (input, options) => {
          const auth = requireAuth(ctx);
          return createHighlightAnnotation({ ctx: auth, create: input, idempotencyKey: options?.idempotencyKey });
        },
        createBookmark: (input, options) => {
          const auth = requireAuth(ctx);
          return createBookmarkAnnotation({ ctx: auth, create: input, idempotencyKey: options?.idempotencyKey });
        },
        batchCreate: (input) => {
          const auth = requireAuth(ctx);
          return batchCreateReadingAnnotations(auth, { payload: input });
        },
        updateNote: (annotationId, input) => {
          const auth = requireAuth(ctx);
          return updateNoteAnnotation({ ctx: auth, annotationId, update: input });
        },
        remove: (annotationId) => {
          const auth = requireAuth(ctx);
          return deleteReadingAnnotation(auth, { annotationId });
        },
      },
    },
  };
}
