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
  ReadingProgressUpdatePayload,
  ReadingRecentSessionsResponse,
  ReadingSession,
  ReadingSessionSummary,
} from "./schemas/readingSession";

import { ApiError } from "./apiHttp";
import { createLoginRequest, discoverSecondPass, getMe, pollLoginRequest } from "./clientApiAuthApi";
import { downloadBookFile, getAuthor, getBook, getSeries, listAuthors, listBooks, listSeries } from "./libraryApi";
import {
  closeReadingSession,
  createReadingAnnotation,
  deleteReadingAnnotation,
  getReadingSession,
  listReadingAnnotations,
  listReadingSessions,
  listRecentReadingSessions,
  openReadingSession,
  startOverReadingSession,
  updateReadingAnnotation,
  updateReadingProgress,
  updateReadingSession,
} from "./readingApi";
import { getShelf, listShelfItems, listShelves } from "./shelvesApi";

export type SecondPassClientConfig = {
  apiBaseUrl: string;
  accessToken: string;
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
      downloadFile(downloadUrl: string): Promise<BookFileDownloadResult>;
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
    openBook(bookId: string | number): Promise<ReadingOpenResponse>;
    startOver(bookId: string | number): Promise<ReadingOpenResponse>;

    sessions: {
      recent(params?: { limit?: number }): Promise<ReadingRecentSessionsResponse>;
      list(params?: {
        page?: number;
        pageSize?: number;
        bookId?: string | number;
        status?: "active" | "completed" | "archived" | string;
        isActive?: boolean;
      }): Promise<PaginatedResponse<ReadingSessionSummary>>;
      get(sessionId: string): Promise<ReadingSessionSummary>;
      update(sessionId: string, payload: { name?: string; notes?: string }): Promise<ReadingSessionSummary>;
      close(sessionId: string): Promise<ReadingSession>;
    };

    progress: {
      update(
        sessionId: string,
        payload: ReadingProgressUpdatePayload,
        options?: { method?: "PUT" | "PATCH" },
      ): Promise<ReadingProgress>;
    };

    annotations: {
      list(params: { sessionId: string; page?: number }): Promise<ReadingAnnotationPage>;
      create(
        payload: ReadingAnnotationCreatePayload,
        options?: { idempotencyKey?: string },
      ): Promise<ReadingAnnotation>;
      update(annotationId: string, payload: ReadingAnnotationUpdatePayload): Promise<ReadingAnnotation>;
      delete(annotationId: string): Promise<void>;
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
      openBook: (bookId) => {
        const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
        return openReadingSession({ apiBaseUrl, accessToken, tokenType, bookId });
      },
      startOver: (bookId) => {
        const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
        return startOverReadingSession({ apiBaseUrl, accessToken, tokenType, bookId });
      },

      sessions: {
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
        update: (sessionId, payload) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return updateReadingSession({ apiBaseUrl, accessToken, tokenType, sessionId, payload });
        },
        close: (sessionId) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return closeReadingSession({ apiBaseUrl, accessToken, tokenType, sessionId });
        },
      },

      progress: {
        update: (sessionId, payload, options) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return updateReadingProgress({ apiBaseUrl, accessToken, tokenType, sessionId, payload, method: options?.method });
        },
      },

      annotations: {
        list: (params) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return listReadingAnnotations({ apiBaseUrl, accessToken, tokenType, sessionId: params.sessionId, page: params.page });
        },
        create: (payload, options) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return createReadingAnnotation({ apiBaseUrl, accessToken, tokenType, payload, idempotencyKey: options?.idempotencyKey });
        },
        update: (annotationId, payload) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return updateReadingAnnotation({ apiBaseUrl, accessToken, tokenType, annotationId, payload });
        },
        delete: (annotationId) => {
          const { apiBaseUrl, accessToken, tokenType } = requireAuth(frozenConfig);
          return deleteReadingAnnotation({ apiBaseUrl, accessToken, tokenType, annotationId });
        },
      },
    },
  };
}
