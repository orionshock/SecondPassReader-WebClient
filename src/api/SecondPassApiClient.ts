import type {
  ClientApiLoginRequestResponse,
  ClientApiPollResponse,
  MePayload,
  SecondPassDiscovery,
} from "../schemas/clientApiAuth";
import type { BookFileDownloadResult, LibraryBook, PaginatedResponse } from "../schemas/library";
import type { PaginatedShelfItemResponse, PaginatedShelfResponse, Shelf } from "../schemas/shelves";
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
} from "../schemas/readingSession";

export { ApiError, type ApiErrorKind } from "./apiHttp";

import { createLoginRequest, getMe, pollLoginRequest } from "./clientApiAuthApi";
import { downloadBookFile, getBook, listBooks } from "./libraryApi";
import {
  closeReadingSession,
  createReadingAnnotation,
  deleteReadingAnnotation,
  listReadingAnnotations,
  listRecentReadingSessions,
  openReadingSession,
  startOverReadingSession,
  updateReadingAnnotation,
  updateReadingProgress,
} from "./readingApi";
import { getShelf, listShelfItems, listShelves } from "./shelvesApi";

export class SecondPassApiClient {
  readonly serverBaseUrl: string;
  accessToken?: string | null;

  constructor(input: { serverBaseUrl: string; accessToken?: string | null }) {
    this.serverBaseUrl = input.serverBaseUrl.replace(/\/+$/, "");
    this.accessToken = input.accessToken ?? null;
  }

  // --- Client API auth / linking ---
  async createLoginRequest(
    discovery: SecondPassDiscovery,
    input?: { clientName?: string; clientType?: string },
  ): Promise<ClientApiLoginRequestResponse> {
    return createLoginRequest(discovery, input, this.accessToken ?? null);
  }

  async pollLoginRequest(pollUrl: string): Promise<ClientApiPollResponse> {
    return pollLoginRequest(pollUrl, this.accessToken ?? null);
  }

  async getMe(input: { apiBaseUrl: string; accessToken: string; tokenType?: string }): Promise<MePayload> {
    return getMe(input);
  }

  // --- Library ---
  async listBooks(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    params?: {
      q?: string;
      hasFiles?: boolean;
      series?: string | number;
      ordering?: string;
      page?: number;
      pageSize?: number;
    };
  }): Promise<PaginatedResponse<LibraryBook>> {
    return listBooks(input);
  }

  async getBook(input: { apiBaseUrl: string; accessToken: string; tokenType?: string; bookId: string }): Promise<LibraryBook> {
    return getBook(input);
  }

  async downloadBookFile(input: {
    downloadUrl: string;
    accessToken: string;
    tokenType?: string;
  }): Promise<BookFileDownloadResult> {
    return downloadBookFile(input);
  }

  // --- Shelves (read-only) ---
  async listShelves(input: { apiBaseUrl: string; accessToken: string; tokenType?: string }): Promise<PaginatedShelfResponse> {
    return listShelves(input);
  }

  async getShelf(input: { apiBaseUrl: string; accessToken: string; tokenType?: string; shelfId: string }): Promise<Shelf> {
    return getShelf(input);
  }

  async listShelfItems(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    shelfId: string;
    page?: number;
  }): Promise<PaginatedShelfItemResponse> {
    return listShelfItems(input);
  }

  // --- Reading sessions / progress / annotations ---
  async listRecentReadingSessions(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    limit?: number;
  }): Promise<ReadingRecentSessionsResponse> {
    return listRecentReadingSessions(input);
  }

  async closeReadingSession(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    sessionId: string;
  }): Promise<ReadingSession> {
    return closeReadingSession(input);
  }

  async openReadingSession(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    bookId: string | number;
  }): Promise<ReadingOpenResponse> {
    return openReadingSession(input);
  }

  async startOverReadingSession(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    bookId: string | number;
  }): Promise<ReadingOpenResponse> {
    return startOverReadingSession(input);
  }

  async updateReadingProgress(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    sessionId: string;
    payload: ReadingProgressUpdatePayload;
    method?: "PUT" | "PATCH";
  }): Promise<ReadingProgress> {
    return updateReadingProgress(input);
  }

  async listReadingAnnotations(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    sessionId: string;
    page?: number;
  }): Promise<ReadingAnnotationPage> {
    return listReadingAnnotations(input);
  }

  async createReadingAnnotation(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    payload: ReadingAnnotationCreatePayload;
    idempotencyKey?: string;
  }): Promise<ReadingAnnotation> {
    return createReadingAnnotation(input);
  }

  async updateReadingAnnotation(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    annotationId: string;
    payload: ReadingAnnotationUpdatePayload;
  }): Promise<ReadingAnnotation> {
    return updateReadingAnnotation(input);
  }

  async deleteReadingAnnotation(input: {
    apiBaseUrl: string;
    accessToken: string;
    tokenType?: string;
    annotationId: string;
  }): Promise<void> {
    return deleteReadingAnnotation(input);
  }
}

