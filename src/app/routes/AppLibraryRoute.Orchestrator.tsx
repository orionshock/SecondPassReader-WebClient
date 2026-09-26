import { lazy, Suspense } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ActiveConnection } from "../../storage/ActiveConnection.Store";
import { HomePage } from "../../features/home/HomePage.UI";
import { LibraryBrowsePage } from "../../features/library/LibraryBrowsePage.UI";
import type { OpenedBook } from "../../features/reader/Reader.Types";
import { SessionDetailPage } from "../../features/sessions/SessionDetailPage.UI";
import { SessionsPage } from "../../features/sessions/SessionsPage.UI";
import { ShelfDetailPage } from "../../features/shelves/ShelfDetailPage.UI";
import { ShelfEditPage } from "../../features/shelves/ShelfEditPage.UI";
import { ShelvesPage } from "../../features/shelves/ShelvesPage.UI";
import type { AppRoute } from "../AppNavigation.Router";
import { navigateTo } from "../AppNavigation.Router";
import type { BrowserConnectivityStatus } from "../connectivity/BrowserConnectivity.State";
import { transitionLibraryRoute } from "./AppLibraryRoute.Policy";
import { OfflineRouteUnavailableNotice } from "./OfflineRouteUnavailableNotice.UI";

const ReadingActivity = lazy(async () => {
  const module = await import("../../features/reader/ReadingActivity.Orchestrator");
  return { default: module.ReadingActivity };
});

const OfflineLibraryPage = lazy(async () => {
  const module = await import("../../features/library/offline/OfflineLibraryPage.UI");
  return { default: module.OfflineLibraryPage };
});

const OfflineHomePage = lazy(async () => {
  const module = await import("../../features/home/offline/OfflineHomePage.UI");
  return { default: module.OfflineHomePage };
});

// Branches on explicit offline state before server-backed route owners mount.
// Unknown connectivity keeps the normal server-authoritative route.
export function AppLibraryRouteRenderer({
  route,
  connection,
  spl,
  connectivity,
  offlineNamespaceKey,
  openedBook,
  readerRestoreError,
  onCloseReader,
  onRetryReaderRestore,
}: {
  route: AppRoute | null;
  connection: ActiveConnection | null;
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
        <h2 className="panelTitle">Opening reader</h2>
        {readerRestoreError ? (
          <div className="errorText">{readerRestoreError}</div>
        ) : (
          <p className="muted">Loading book...</p>
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
        <Suspense fallback={<p className="muted">Loading reader...</p>}>
          <ReadingActivity
            openedBook={openedBook}
            onBackToLibrary={() => {
              navigateTo({ kind: "home" });
              onCloseReader();
            }}
            spl={spl}
            connectivity={connectivity}
            offlineNamespaceKey={offlineNamespaceKey}
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
          area={route.kind === "sessions" || route.kind === "session" ? "Reading Sessions" : "Shelves"}
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
          connection={connection}
          spl={spl}
          scope={route.scope}
          q={route.q}
          ordering={route.ordering}
          onChangeScope={(scope) => {
            navigateTo({
              kind: "shelves",
              scope: scope === "personal" ? undefined : scope,
              ordering: route.ordering,
              bookId: route.bookId,
            });
          }}
          onCommitSearch={(q) => {
            navigateTo({
              kind: "shelves",
              scope: route.scope,
              q: q || undefined,
              ordering: route.ordering,
              bookId: route.bookId,
            });
          }}
          onChangeOrdering={(ordering) => {
            navigateTo({
              kind: "shelves",
              scope: route.scope,
              q: route.q,
              ordering,
              bookId: route.bookId,
            });
          }}
          onViewBook={(bookId) => navigateTo({ ...route, bookId })}
        />
      </div>
    );
  }

  if (route?.kind === "shelf") {
    return (
      <div className="libraryScreen">
        <ShelfDetailPage
          connection={connection}
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
        <ShelfEditPage connection={connection} spl={spl} shelfId={route.shelfId} />
      </div>
    );
  }

  if (route?.kind === "sessions") {
    return (
      <div className="libraryScreen">
        <SessionsPage connection={connection} spl={spl} bookId={route.bookId ?? null} searchQuery={route.q ?? ""} />
      </div>
    );
  }

  if (route?.kind === "session") {
    return (
      <div className="libraryScreen">
        <SessionDetailPage connection={connection} spl={spl} sessionId={route.sessionId} />
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
              onViewBook={(bookId) => navigateTo(transitionLibraryRoute(route, {
                type: "open-book-detail",
                bookId,
              }))}
            />
          </Suspense>
        </div>
      );
    }
    return (
      <div className="libraryScreen">
        <LibraryBrowsePage
          connection={connection}
          spl={spl}
          route={route}
          selectedBookId={route.bookId ?? null}
          onViewBook={(bookId) => {
            navigateTo(transitionLibraryRoute(route, { type: "open-book-detail", bookId }));
          }}
          onCommitSearch={(q) => {
            navigateTo(transitionLibraryRoute(route, { type: "commit-search", query: q }));
          }}
          onShowBooks={() => {
            navigateTo(transitionLibraryRoute(route, { type: "select-axis", axis: "books" }));
          }}
          onShowSeries={() => {
            navigateTo(transitionLibraryRoute(route, { type: "select-axis", axis: "series" }));
          }}
          onShowAuthors={() => {
            navigateTo(transitionLibraryRoute(route, { type: "select-axis", axis: "authors" }));
          }}
          onShowSeriesBooks={(seriesId) => {
            navigateTo(transitionLibraryRoute(route, {
              type: "select-entity",
              entity: { type: "series", id: seriesId },
            }));
          }}
          onShowAuthorBooks={(authorId) => {
            navigateTo(transitionLibraryRoute(route, {
              type: "select-entity",
              entity: { type: "author", id: authorId },
            }));
          }}
          onSelectGroup={(groupId) => navigateTo(transitionLibraryRoute(route, {
            type: "select-group",
            groupId: groupId ?? undefined,
          }))}
          onRemoveUnavailableGroup={() => navigateTo(transitionLibraryRoute(route, {
            type: "remove-unavailable-group",
          }))}
          onSelectTag={(tag) => navigateTo(transitionLibraryRoute(route, {
            type: "select-tag",
            tag: tag ?? undefined,
          }))}
          onChangeOrdering={(ordering) => navigateTo(transitionLibraryRoute(route, {
            type: "change-ordering",
            ordering,
          }))}
          onChangePageSize={(pageSize) => navigateTo(transitionLibraryRoute(route, {
            type: "change-page-size",
            pageSize,
          }))}
          onChangePage={(page) => navigateTo(transitionLibraryRoute(route, {
            type: "change-page",
            page,
          }))}
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
      <HomePage connection={connection} spl={spl} offlineNamespaceKey={offlineNamespaceKey} />
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
