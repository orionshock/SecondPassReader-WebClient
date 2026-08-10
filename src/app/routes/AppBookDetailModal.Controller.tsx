import type { SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { BookDetailModal } from "../../features/library/BookDetail.Modal";
import { saveReaderReturnTarget } from "../../features/reader/ReaderReturnTarget.Store";
import type { ReaderReturnTarget } from "../../features/reader/Reader.Types";
import type { AppRoute } from "../AppNavigation.Router";
import { navigateTo, routeToHash, withoutBookModal } from "../AppNavigation.Router";

export function AppBookDetailModalController({
  route,
  profile,
  spl,
}: {
  route: AppRoute | null;
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
}) {
  const modalBookId =
    route?.kind === "home"
      ? route.bookId ?? null
      : route?.kind === "library"
        ? route.bookId ?? null
        : route?.kind === "shelves"
          ? route.bookId ?? null
          : route?.kind === "shelf"
            ? route.bookId ?? null
            : null;
  if (!modalBookId) return null;

  return (
    <BookDetailModal
      profile={profile}
      spl={spl}
      bookId={modalBookId}
      initialBook={null}
      onClose={() => {
        if (!route) return;
        navigateTo(withoutBookModal(route), { replace: true });
      }}
      onOpenReader={(book) => {
        openReaderWithReturnTarget(book.id, getReaderReturnTargetForRoute(route));
      }}
      onViewSessions={(book) => {
        navigateTo({ kind: "sessions", bookId: String(book.id) });
      }}
      onViewAuthor={(authorId) => {
        navigateTo({
          kind: "library",
          browse: "authors",
          authorId,
          groupId: route?.kind === "library" ? route.groupId : undefined,
          tag: route?.kind === "library" ? route.tag : undefined,
          ordering: "title",
          page: 1,
          pageSize: route?.kind === "library" ? route.pageSize ?? 20 : 20,
        });
      }}
      onViewSeries={(seriesId) => {
        navigateTo({
          kind: "library",
          browse: "series",
          seriesId,
          groupId: route?.kind === "library" ? route.groupId : undefined,
          tag: route?.kind === "library" ? route.tag : undefined,
          ordering: "series_index",
          page: 1,
          pageSize: route?.kind === "library" ? route.pageSize ?? 20 : 20,
        });
      }}
      onViewTag={(tag) => {
        navigateTo({
          kind: "library",
          browse: "books",
          groupId: route?.kind === "library" ? route.groupId : undefined,
          tag,
          ordering: "title",
          page: 1,
          pageSize: route?.kind === "library" ? route.pageSize ?? 20 : 20,
        });
      }}
      onManageShelves={() => navigateTo({ kind: "shelves" })}
      launchMessage={null}
      downloadState={{ phase: "idle" }}
    />
  );
}

function getReaderReturnTargetForRoute(route: AppRoute | null): ReaderReturnTarget {
  if (!route) return { kind: "home", label: "Home", route: "#/home" };
  if (route.kind === "library") {
    return {
      kind: route.browse === "series" && route.seriesId ? "series" : "library",
      label: route.browse === "series" && route.seriesId ? "Series" : "Library",
      route: routeToHash(withoutBookModal(route)),
      seriesId: route.browse === "series" ? route.seriesId : undefined,
    };
  }
  if (route.kind === "shelves") {
    return {
      kind: "shelves",
      label: "Shelves",
      route: routeToHash(withoutBookModal(route)),
    };
  }
  if (route.kind === "shelf") {
    return {
      kind: "shelf",
      label: "Shelf",
      route: routeToHash(withoutBookModal(route)),
      shelfId: route.shelfId,
    };
  }
  if (route.kind === "sessions") {
    return {
      kind: "sessions",
      label: "Reading sessions",
      route: routeToHash(route),
    };
  }
  if (route.kind === "session") {
    return {
      kind: "sessions",
      label: "Session detail",
      route: routeToHash(route),
      sessionId: route.sessionId,
    };
  }
  return { kind: "home", label: "Home", route: "#/home" };
}

function openReaderWithReturnTarget(bookId: string | number, returnTarget: ReaderReturnTarget) {
  const id = String(bookId);
  saveReaderReturnTarget(id, returnTarget);
  navigateTo({ kind: "reader", bookId: id });
}
