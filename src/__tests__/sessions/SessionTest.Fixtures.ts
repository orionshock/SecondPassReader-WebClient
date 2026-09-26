import type {
  MarginaliaRecentSession,
  MarginaliaSession,
  MarginaliaSessionListItem,
} from "@secondpass/client";

export const rawSessionId = "51388269-2a4b-4a13-8428-7b57805a7445";

export function sessionFixture(overrides: Partial<MarginaliaSession> = {}): MarginaliaSession {
  const status = overrides.status ?? "active";
  return {
    id: rawSessionId,
    name: "Reading session",
    notes: "Session note",
    status,
    startedAt: "2026-09-06T00:00:00Z",
    closedAt: status === "closed" ? "2026-09-07T00:00:00Z" : null,
    updatedAt: "2026-09-06T00:00:00Z",
    lastActivityAt: "2026-09-06T00:00:00Z",
    annotationCount: 0,
    progress: null,
    ...overrides,
  };
}

export function sessionListItemFixture(overrides: Partial<MarginaliaSessionListItem> = {}): MarginaliaSessionListItem {
  return {
    ...sessionFixture(overrides),
    book: { id: "book-1", title: "Book One", coverUrl: null, canOpen: true },
    ...overrides,
  };
}

export function recentSessionFixture(overrides: Partial<MarginaliaRecentSession> = {}): MarginaliaRecentSession {
  return {
    id: "session-1",
    name: "Evening reading",
    status: "active",
    lastActivityAt: "2026-08-02T12:00:00Z",
    book: { id: "book-1", title: "Book One", coverUrl: null, canOpen: true },
    progress: {
      location: "epubcfi(/6/8!/4/2)",
      locationLabel: "Chapter 08 - 42%",
      updatedAt: "2026-08-02T12:00:00Z",
    },
    ...overrides,
  };
}
