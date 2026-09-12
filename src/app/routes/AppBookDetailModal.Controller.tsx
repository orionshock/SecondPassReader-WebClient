import { lazy, Suspense } from "react";
import type { BookDetail, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { BookDetailModal } from "../../features/library/BookDetailModal.UI";
import type { ReaderReturnTarget } from "../../features/reader/Reader.Types";
import type { AppRoute } from "../AppNavigation.Router";
import { navigateTo, routeToHash, withoutBookModal } from "../AppNavigation.Router";
import type { BrowserConnectivityStatus } from "../connectivity/BrowserConnectivity.State";

const OfflineBookDetailDialog = lazy(async () => {
  const module = await import("../../features/library/bookDetail/offline/OfflineBookDetailDialog.UI");
  return { default: module.OfflineBookDetailDialog };
});

export function AppBookDetailModalController({
  route,
  profile,
  spl,
  connectivity,
  offlineNamespaceKey,
  onOpenReader,
}: {
  route: AppRoute | null;
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  connectivity: BrowserConnectivityStatus;
  offlineNamespaceKey: string | null;
  onOpenReader: (book: BookDetail, returnTarget: ReaderReturnTarget) => void;
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

  if (connectivity === "offline") {
    return (
      <Suspense fallback={null}>
        <OfflineBookDetailDialog
          namespaceKey={offlineNamespaceKey}
          bookId={modalBookId}
          onClose={() => {
            if (!route) return;
            navigateTo(withoutBookModal(route), { replace: true });
          }}
          onOpenReader={(book) => onOpenReader(book, getReaderReturnTargetForRoute(route))}
          onManageOffline={() => navigateTo({ kind: "settings", tab: "offline", bookId: modalBookId })}
        />
      </Suspense>
    );
  }

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
        onOpenReader(book, getReaderReturnTargetForRoute(route));
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
      onManageOffline={(book) => navigateTo({ kind: "settings", tab: "offline", bookId: String(book.id) })}
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
      label: "Reading Sessions",
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
