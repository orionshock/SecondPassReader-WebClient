import type { MarginaliaRecentSession, Shelf } from "@secondpass/client";
import type { OfflineReaderBookState } from "../../../app/offline/storage/OfflineRepositories.Types";

export type OfflineHomeRecentItem = {
  sessionId: string;
  sessionName: string;
  sessionStatus: MarginaliaRecentSession["status"];
  lastActivityAt: string;
  bookId: string;
  bookTitle: string;
  progress: {
    cfi: string;
    locationLabel: string;
    percentage: number | null;
    source: "cached-server" | "local";
  } | null;
  offlineReadable: boolean;
};

export type OfflineHomeShelfItem = {
  shelfId: string;
  name: string;
  bookCount: number;
  ownerLabel: string | null;
};

export function presentOfflineHomeRecent(input: {
  cachedItems: readonly MarginaliaRecentSession[];
  readerStates: ReadonlyMap<string, OfflineReaderBookState | null>;
  readableBookIds: ReadonlySet<string>;
}): OfflineHomeRecentItem[] {
  return input.cachedItems.map((item) => {
    const bookId = String(item.book.id);
    const localProgress = input.readerStates.get(bookId)?.progress ?? null;
    const progress = localProgress
      ? {
          cfi: localProgress.cfi,
          locationLabel: localProgress.locationLabel,
          percentage: localProgress.percentage,
          source: "local" as const,
        }
      : item.progress
        ? {
            cfi: item.progress.cfi,
            locationLabel: item.progress.locationLabel,
            percentage: null,
            source: "cached-server" as const,
          }
        : null;
    return {
      sessionId: item.id,
      sessionName: item.name,
      sessionStatus: item.status,
      lastActivityAt: item.lastActivityAt,
      bookId,
      bookTitle: item.book.title,
      progress,
      offlineReadable: input.readableBookIds.has(bookId),
    };
  });
}

export function presentOfflineHomeShelves(items: readonly Shelf[]): OfflineHomeShelfItem[] {
  return items.map((shelf) => ({
    shelfId: String(shelf.id),
    name: shelf.name,
    bookCount: shelf.item_count ?? 0,
    ownerLabel: shelfOwnerLabel(shelf),
  }));
}

function shelfOwnerLabel(shelf: Shelf): string | null {
  if (shelf.owner_type === "group") {
    return displayString(shelf.owner_group?.name) || displayString(shelf.owner_group?.display_name) || null;
  }
  if (shelf.owner_type !== "user") return null;
  return displayString(shelf.owner_user?.display_name)
    || [displayString(shelf.owner_user?.first_name), displayString(shelf.owner_user?.last_name)].filter(Boolean).join(" ")
    || displayString(shelf.owner_user?.username)
    || null;
}

function displayString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
