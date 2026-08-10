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

const ReadingActivity = lazy(async () => {
  const module = await import("../../features/reader/Reading.Activity");
  return { default: module.ReadingActivity };
});

export function AppLibraryRouteRenderer({
  route,
  profile,
  spl,
  openedBook,
  readerRestoreError,
  onCloseReader,
  onRetryReaderRestore,
}: {
  route: AppRoute | null;
  profile: ConnectionProfile | null;
  spl: SecondPassClient | null;
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
            initialSearchQuery={route.search ?? null}
          />
        </Suspense>
      </section>
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
              searchMode: patch.groupId !== undefined || patch.tag !== undefined ? undefined : route.searchMode,
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

  return (
    <div className="libraryScreen">
      <HomePage profile={profile} spl={spl} />
    </div>
  );
}
