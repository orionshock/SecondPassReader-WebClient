import { lazy, Suspense } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { HomePage } from "../../features/home/Home.Page";
import { LibraryBrowsePage } from "../../features/library/LibraryBrowse.Page";
import type { OpenedBook } from "../../features/reader/Reader.Types";
import { SessionDetailPage } from "../../features/sessions/SessionDetail.Page";
import { SessionsPage } from "../../features/sessions/Sessions.Page";
import { ShelfDetailPage } from "../../features/shelves/ShelfDetail.Page";
import { ShelfEditPage } from "../../features/shelves/ShelfEdit.Page";
import { ShelvesPage } from "../../features/shelves/Shelves.Page";
import type { AppRoute } from "../AppNavigation.Router";
import { navigateTo, withBookModal } from "../AppNavigation.Router";
import type { BrowserConnectivityStatus } from "../connectivity/BrowserConnectivity.State";
import { OfflineRouteUnavailableNotice } from "./OfflineRouteUnavailable.Notice";

const ReadingActivity = lazy(async () => {
  const module = await import("../../features/reader/Reading.Activity");
  return { default: module.ReadingActivity };
});

const OfflineLibraryPage = lazy(async () => {
  const module = await import("../../features/library/offline/OfflineLibrary.Page");
  return { default: module.OfflineLibraryPage };
});

const OfflineHomePage = lazy(async () => {
  const module = await import("../../features/home/offline/OfflineHome.Page");
  return { default: module.OfflineHomePage };
});

export function AppLibraryRouteRenderer({
  route,
  profile,
  spl,
  connectivity,
  offlineNamespaceKey,
  openedBook,
  readerRestoreError,
  onCloseReader,
  onRetryReaderRestore,
}: {
  route: AppRoute | null;
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
  connectivity: BrowserConnectivityStatus;
  offlineNamespaceKey: string | null;
  openedBook: OpenedBook | null;
  readerRestoreError: string | null;
  onCloseReader: () => void;
  onRetryReaderRestore: () => void;
}) {
  if (route?.kind === "reader" && !openedBook) {
    return (
      <section className="panel workflowPanel">
        <h2 className="panelTitle">Opening book</h2>
        {readerRestoreError ? (
          <div className="errorText">{readerRestoreError}</div>
        ) : (
          <p className="muted">{`Restoring reader${"\u2026"}`}</p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="button buttonCompact"
            onClick={() => {
              navigateTo({ kind: "home" });
              onCloseReader();
            }}
          >
            Home
          </button>
          <button type="button" className="button buttonCompact" onClick={onRetryReaderRestore}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (openedBook && route?.kind === "reader") {
    return (
      <section className="readerScreen">
        <Suspense fallback={<p className="muted">{`Loading reader${"\u2026"}`}</p>}>
          <ReadingActivity
            openedBook={openedBook}
            onBackToLibrary={() => {
              navigateTo({ kind: "home" });
              onCloseReader();
            }}
            spl={spl}
            connectivity={connectivity}
            initialSearchQuery={route.search ?? null}
          />
        </Suspense>
      </section>
    );
  }

  if (connectivity === "offline" && isServerOnlyRoute(route)) {
    return (
      <div className="libraryScreen">
        <OfflineRouteUnavailableNotice
          area={route.kind === "sessions" || route.kind === "session" ? "Reading sessions" : "Shelves"}
          onOpenHome={() => navigateTo({ kind: "home" })}
          onOpenLibrary={() => navigateTo({ kind: "library" })}
          onOpenOfflineSettings={() => navigateTo({ kind: "settings", tab: "offline" })}
        />
      </div>
    );
  }

  if (route?.kind === "shelves") {
    return (
      <div className="libraryScreen">
        <ShelvesPage
          profile={profile}
          spl={spl}
          ordering={route.ordering}
          page={route.page ?? 1}
          pageSize={route.pageSize ?? 20}
          onUpdateRoute={(patch) => {
            navigateTo({
              kind: "shelves",
              ordering: patch.ordering ?? route.ordering ?? "name",
              page: patch.page ?? route.page ?? 1,
              pageSize: patch.pageSize ?? route.pageSize ?? 20,
              bookId: route.bookId,
            });
          }}
        />
      </div>
    );
  }

  if (route?.kind === "shelf") {
    return (
      <div className="libraryScreen">
        <ShelfDetailPage
          profile={profile}
          spl={spl}
          shelfId={route.shelfId}
          selectedBookId={route.bookId ?? null}
          ordering={route.ordering}
          page={route.page ?? 1}
          pageSize={route.pageSize ?? 20}
          onUpdateRoute={(patch) => {
            navigateTo({
              kind: "shelf",
              shelfId: route.shelfId,
              ordering: patch.ordering ?? route.ordering ?? "position",
              page: patch.page ?? route.page ?? 1,
              pageSize: patch.pageSize ?? route.pageSize ?? 20,
              bookId: route.bookId,
            });
          }}
        />
      </div>
    );
  }

  if (route?.kind === "shelfEdit") {
    return (
      <div className="libraryScreen">
        <ShelfEditPage profile={profile} spl={spl} shelfId={route.shelfId} />
      </div>
    );
  }

  if (route?.kind === "sessions") {
    return (
      <div className="libraryScreen">
        <SessionsPage profile={profile} spl={spl} bookId={route.bookId ?? null} searchQuery={route.q ?? ""} />
      </div>
    );
  }

  if (route?.kind === "session") {
    return (
      <div className="libraryScreen">
        <SessionDetailPage profile={profile} spl={spl} sessionId={route.sessionId} />
      </div>
    );
  }

  if (route?.kind === "library") {
    if (connectivity === "offline") {
      return (
        <div className="libraryScreen">
          <Suspense fallback={<p className="muted">{`Loading downloaded books${"\u2026"}`}</p>}>
            <OfflineLibraryPage
              namespaceKey={offlineNamespaceKey}
              onViewBook={(bookId) => navigateTo(withBookModal(route, bookId))}
            />
          </Suspense>
        </div>
      );
    }
    return (
      <div className="libraryScreen">
        <LibraryBrowsePage
          profile={profile}
          spl={spl}
          route={{
            q: route.q,
            searchMode: route.searchMode,
            browse: route.browse,
            seriesId: route.seriesId,
            authorId: route.authorId,
            groupId: route.groupId,
            tag: route.tag,
            view: route.view,
            ordering: route.ordering,
            page: route.page,
            pageSize: route.pageSize,
          }}
          selectedBookId={route.bookId ?? null}
          onViewBook={(bookId) => {
            navigateTo(withBookModal(route, bookId));
          }}
          onCommitSearch={(q) => {
            const next = q.trim();
            const browse = route.browse ?? "books";
            const ordering = browse === "books" ? "title" : "name";
            navigateTo(
              next
                ? {
                    kind: "library",
                    browse,
                    q: next,
                    searchMode: route.searchMode,
                    groupId: route.groupId,
                    tag: route.tag,
                    ordering,
                    page: 1,
                    pageSize: route.pageSize ?? 20,
                    bookId: route.bookId,
                  }
                : {
                    kind: "library",
                    browse,
                    groupId: route.groupId,
                    tag: route.tag,
                    ordering,
                    page: 1,
                    pageSize: route.pageSize ?? 20,
                    bookId: route.bookId,
                  },
            );
          }}
          onShowBooks={() => {
            navigateTo({
              kind: "library",
              browse: "books",
              groupId: route.groupId,
              tag: route.tag,
              ordering: "title",
              page: 1,
              pageSize: route.pageSize ?? 20,
              bookId: route.bookId,
            });
          }}
          onShowSeries={() => {
            navigateTo({
              kind: "library",
              browse: "series",
              groupId: route.groupId,
              tag: route.tag,
              ordering: "name",
              page: 1,
              pageSize: route.pageSize ?? 20,
              bookId: route.bookId,
            });
          }}
          onShowAuthors={() => {
            navigateTo({
              kind: "library",
              browse: "authors",
              groupId: route.groupId,
              tag: route.tag,
              ordering: "name",
              page: 1,
              pageSize: route.pageSize ?? 20,
              bookId: route.bookId,
            });
          }}
          onShowSeriesBooks={(seriesId) => {
            navigateTo({
              kind: "library",
              browse: "series",
              seriesId,
              groupId: route.groupId,
              tag: route.tag,
              ordering: "series_index",
              page: 1,
              pageSize: route.pageSize ?? 20,
              bookId: route.bookId,
            });
          }}
          onShowAuthorBooks={(authorId) => {
            navigateTo({
              kind: "library",
              browse: "authors",
              authorId,
              groupId: route.groupId,
              tag: route.tag,
              ordering: "title",
              page: 1,
              pageSize: route.pageSize ?? 20,
              bookId: route.bookId,
            });
          }}
          onUpdateRoute={(patch) => {
            navigateTo({
              kind: "library",
              q: route.q,
              searchMode: patch.tag !== undefined && patch.tag !== null ? undefined : route.searchMode,
              browse: route.browse ?? "books",
              seriesId: route.seriesId,
              authorId: route.authorId,
              groupId: patch.groupId === null ? undefined : patch.groupId ?? route.groupId,
              tag: patch.tag === null ? undefined : patch.tag ?? route.tag,
              view: route.view,
              ordering: patch.ordering ?? route.ordering,
              page: patch.page ?? route.page ?? 1,
              pageSize: patch.pageSize ?? route.pageSize ?? 20,
              bookId: route.bookId,
            });
          }}
        />
      </div>
    );
  }

  if (connectivity === "offline") {
    return (
      <div className="libraryScreen">
        <Suspense fallback={<p className="muted">{`Loading saved Home${"\u2026"}`}</p>}>
          <OfflineHomePage
            namespaceKey={offlineNamespaceKey}
            onOpenLibrary={() => navigateTo({ kind: "library" })}
            onViewBook={(bookId) => navigateTo({ kind: "home", bookId })}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="libraryScreen">
      <HomePage profile={profile} spl={spl} offlineNamespaceKey={offlineNamespaceKey} />
    </div>
  );
}

function isServerOnlyRoute(route: AppRoute | null): route is Extract<
  AppRoute,
  { kind: "sessions" | "session" | "shelves" | "shelf" | "shelfEdit" }
> {
  return route?.kind === "sessions"
    || route?.kind === "session"
    || route?.kind === "shelves"
    || route?.kind === "shelf"
    || route?.kind === "shelfEdit";
}
