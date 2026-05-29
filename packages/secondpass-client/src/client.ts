import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  MePayload,
  SecondPassDiscovery,
} from "./schemas/clientApiAuth";
import type {
  BookFileDownloadResult,
  LibraryAuthor,
  LibraryBook,
  LibrarySeries,
  PaginatedResponse,
} from "./schemas/library";
import type { PaginatedShelfItemResponse, PaginatedShelfResponse, Shelf } from "./schemas/shelves";
import type {
  ReadingAnnotation,
  ReadingAnnotationCreatePayload,
  ReadingAnnotationPage,
  ReadingAnnotationUpdatePayload,
  ReadingOpenResponse,
  ReadingProgress,
  ReadingRecentSessionsResponse,
  ReadingSession,
  ReadingSessionSummary,
} from "./schemas/readingSession";

import { ApiError } from "./apiHttp";
import { createLoginRequest, discoverSecondPass, getMe, pollLoginRequest } from "./clientApiAuthApi";
import { downloadBookFile, getAuthor, getBook, getSeries, listAuthors, listBooks, listSeries } from "./libraryApi";
import {
  closeReadingSession,
  createBookmarkAnnotation,
  createHighlightAnnotation,
  createReadingAnnotation,
  deleteReadingAnnotation,
  getReadingSession,
  listReadingAnnotations,
  listReadingSessions,
  listRecentReadingSessions,
  openReadingSession,
  saveReadingProgress,
  startOverReadingSession,
  updateReadingAnnotation,
  updateNoteAnnotation,
  updateReadingSession,
} from "./readingApi";
import type { CreateBookmarkInput, CreateHighlightInput, SaveReadingProgressInput, UpdateNoteInput } from "./readingApi";

export type { CreateBookmarkInput, CreateHighlightInput, SaveReadingProgressInput, UpdateNoteInput } from "./readingApi";
import { getShelf, listShelfItems, listShelves } from "./shelvesApi";

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
       * Download an arbitrary file URL previously obtained from the server.
       *
       * Prefer `downloadEpub()` in app code to avoid handling `download_url` fields directly.
       */
      downloadFile(downloadUrl: string): Promise<BookFileDownloadResult>;
      downloadEpub(book: LibraryBook | string | number): Promise<BookFileDownloadResult>;
    };
    series: {
      list(params?: { page?: number }): Promise<PaginatedResponse<LibrarySeries>>;
      get(seriesId: string): Promise<LibrarySeries>;
      books(seriesId: string, params?: Omit<LibraryBookListParams, "series">): Promise<PaginatedResponse<LibraryBook>>;
    };
    authors: {
      list(params?: { page?: number }): Promise<PaginatedResponse<LibraryAuthor>>;
      get(authorId: string): Promise<LibraryAuthor>;
      books(authorId: string, params?: Omit<LibraryBookListParams, "author">): Promise<PaginatedResponse<LibraryBook>>;
    };
  };

  shelves: {
    list(params?: { page?: number }): Promise<PaginatedShelfResponse>;
    get(shelfId: string): Promise<Shelf>;
    items(shelfId: string, params?: { page?: number }): Promise<PaginatedShelfItemResponse>;
  };

  reading: {
    openForReading(book: LibraryBook | string | number): Promise<{ open: ReadingOpenResponse; blob: Blob }>;

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
      }): Promise<PaginatedResponse<ReadingSessionSummary>>;
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
      list(params: { sessionId: string; page?: number }): Promise<ReadingAnnotationPage>;
      createHighlight(input: CreateHighlightInput, options?: { idempotencyKey?: string }): Promise<ReadingAnnotation>;
      createBookmark(input: CreateBookmarkInput, options?: { idempotencyKey?: string }): Promise<ReadingAnnotation>;
      updateNote(annotationId: string, input: UpdateNoteInput): Promise<ReadingAnnotation>;
      remove(annotationId: string): Promise<void>;
      raw: {
        create(payload: ReadingAnnotationCreatePayload, options?: { idempotencyKey?: string }): Promise<ReadingAnnotation>;
        update(annotationId: string, payload: ReadingAnnotationUpdatePayload): Promise<ReadingAnnotation>;
      };
    };
  };
};

function requireAuth(config: SecondPassClientConfig): { apiBaseUrl: string; accessToken: string; tokenType: string } {
  if (!config.apiBaseUrl) throw new Error("SecondPassClient config.apiBaseUrl is required.");
  if (!config.accessToken) {
    throw new ApiError({ kind: "unauthorized", status: 401, message: "Access token is missing." });
  }
  return { apiBaseUrl: config.apiBaseUrl, accessToken: config.accessToken, tokenType: config.tokenType ?? "Bearer" };
}

export function createSecondPassClient(config: SecondPassClientConfig): SecondPassClient {
  const frozenConfig = Object.freeze({ ...config });

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
        const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
        return getMe({ apiBaseUrl, accessToken, tokenType });
      },
    },

    library: {
      books: {
        list: (params) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return listBooks({ apiBaseUrl, accessToken, tokenType, params });
        },
        get: (bookId) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return getBook({ apiBaseUrl, accessToken, tokenType, bookId });
        },
        downloadFile: (downloadUrl) => {
          const { accessToken, tokenType } = requireAuth(frozenConfig);
          return downloadBookFile({ downloadUrl, accessToken, tokenType });
        },
        downloadEpub: async (book) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          const resolved =
            typeof book === "string" || typeof book === "number"
              ? await getBook({ apiBaseUrl, accessToken, tokenType, bookId: String(book) })
              : book;
          const url = resolved.file?.download_url ?? null;
          if (!url) throw new Error("No EPUB file available for this book.");
          return downloadBookFile({ downloadUrl: url, accessToken, tokenType });
        },
      },

      series: {
        list: (params) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return listSeries({ apiBaseUrl, accessToken, tokenType, page: params?.page });
        },
        get: (seriesId) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return getSeries({ apiBaseUrl, accessToken, tokenType, seriesId });
        },
        books: (seriesId, params) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return listBooks({ apiBaseUrl, accessToken, tokenType, params: { ...params, series: seriesId } });
        },
      },

      authors: {
        list: (params) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return listAuthors({ apiBaseUrl, accessToken, tokenType, page: params?.page });
        },
        get: (authorId) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return getAuthor({ apiBaseUrl, accessToken, tokenType, authorId });
        },
        books: (authorId, params) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return listBooks({ apiBaseUrl, accessToken, tokenType, params: { ...params, author: authorId } });
        },
      },
    },

    shelves: {
      list: () => {
        const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
        return listShelves({ apiBaseUrl, accessToken, tokenType });
      },
      get: (shelfId) => {
        const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
        return getShelf({ apiBaseUrl, accessToken, tokenType, shelfId });
      },
      items: (shelfId, params) => {
        const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
        return listShelfItems({ apiBaseUrl, accessToken, tokenType, shelfId, page: params?.page });
      },
    },

    reading: {
      openForReading: async (book) => {
        const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
        const resolved =
          typeof book === "string" || typeof book === "number"
            ? await getBook({ apiBaseUrl, accessToken, tokenType, bookId: String(book) })
            : book;
        const open = await openReadingSession({ apiBaseUrl, accessToken, tokenType, bookId: resolved.id });
        const url = resolved.file?.download_url ?? null;
        if (!url) throw new Error("No EPUB file available for this book.");
        const dl = await downloadBookFile({ downloadUrl: url, accessToken, tokenType });
        return { open, blob: dl.blob };
      },

      sessions: {
        open: (bookId) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return openReadingSession({ apiBaseUrl, accessToken, tokenType, bookId });
        },
        startOver: (bookId) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return startOverReadingSession({ apiBaseUrl, accessToken, tokenType, bookId });
        },
        recent: (params) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return listRecentReadingSessions({ apiBaseUrl, accessToken, tokenType, limit: params?.limit });
        },
        list: (params) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return listReadingSessions({ apiBaseUrl, accessToken, tokenType, ...params });
        },
        get: (sessionId) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return getReadingSession({ apiBaseUrl, accessToken, tokenType, sessionId });
        },
        updateDetails: (sessionId, payload) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return updateReadingSession({ apiBaseUrl, accessToken, tokenType, sessionId, payload });
        },
        close: (sessionId) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return closeReadingSession({ apiBaseUrl, accessToken, tokenType, sessionId });
        },
      },

      progress: {
        save: (sessionId, progress) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return saveReadingProgress({ apiBaseUrl, accessToken, tokenType, sessionId, progress });
        },
      },

      annotations: {
        list: (params) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return listReadingAnnotations({ apiBaseUrl, accessToken, tokenType, sessionId: params.sessionId, page: params.page });
        },
        createHighlight: (input, options) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return createHighlightAnnotation({ apiBaseUrl, accessToken, tokenType, create: input, idempotencyKey: options?.idempotencyKey });
        },
        createBookmark: (input, options) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return createBookmarkAnnotation({ apiBaseUrl, accessToken, tokenType, create: input, idempotencyKey: options?.idempotencyKey });
        },
        updateNote: (annotationId, input) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return updateNoteAnnotation({ apiBaseUrl, accessToken, tokenType, annotationId, update: input });
        },
        remove: (annotationId) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return deleteReadingAnnotation({ apiBaseUrl, accessToken, tokenType, annotationId });
        },
        raw: {
          create: (payload, options) => {
            const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
            return createReadingAnnotation({ apiBaseUrl, accessToken, tokenType, payload, idempotencyKey: options?.idempotencyKey });
          },
          update: (annotationId, payload) => {
            const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
            return updateReadingAnnotation({ apiBaseUrl, accessToken, tokenType, annotationId, payload });
          },
        },
      },
    },
  };
}
