import type { MarginaliaBookSessions, MarginaliaRecentSessions, MarginaliaSessionListItem, PaginatedResponse, SecondPassClient } from "@secondpass/client";

export function loadRecentReading(
  spl: SecondPassClient,
  options?: { includeCompleted?: boolean },
): Promise<MarginaliaRecentSessions> {
  return spl.marginalia.sessions.recent(
    options?.includeCompleted ? { limit: 10, includeClosed: true } : { limit: 10 },
  );
}

export function loadSessionsPage(input: {
  spl: SecondPassClient;
  bookId?: string;
  status?: "active" | "closed";
  q?: string;
  page: number;
  pageSize: number;
}): Promise<PaginatedResponse<MarginaliaSessionListItem> | MarginaliaBookSessions> {
  const params = { status: input.status, q: input.q, page: input.page, pageSize: input.pageSize };
  return input.bookId
    ? input.spl.marginalia.books.sessions(input.bookId, params)
    : input.spl.marginalia.sessions.list(params);
}
