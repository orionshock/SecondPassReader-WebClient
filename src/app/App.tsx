import "./App.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientApiLinking } from "../features/connection/ClientApiLinking";
import { ClientApiVerification } from "../features/connection/ClientApiVerification";
import { ConnectServerScreen } from "../features/connection/ConnectServerScreen";
import { LibraryBrowsePage } from "../features/library/LibraryBrowsePage";
import { HomePage } from "../features/home/HomePage";
import { ReadingActivity } from "../features/reader/ReadingActivity";
import type { OpenedBook } from "../features/reader/types";
import { getAppWorkflowStep } from "./appWorkflow";
import type { AppRoute } from "./navigation";
import { navigateTo, parseCurrentRoute, routeToHash, withBookModal, withoutBookModal } from "./navigation";
import {
  clearActiveConnection,
  getActiveConnection,
  saveConnectionProfile,
  type ConnectionProfile,
} from "../storage/connectionProfiles";
import { getAppTheme, saveAppTheme, type AppTheme } from "../storage/appTheme";
import { AppHeader } from "./AppHeader";
import { SettingsPanel } from "./SettingsPanel";
import { openBookForReader } from "../features/library/openBookForReader";
import { ApiError } from "@secondpass/client";
import { ShelvesPage } from "../features/shelves/ShelvesPage";
import { ShelfDetailPage } from "../features/shelves/ShelfDetailPage";
import { ShelfEditPage } from "../features/shelves/ShelfEditPage";
import { BookDetailModal } from "../features/library/BookDetailModal";
import { SessionsPage } from "../features/sessions/SessionsPage";
import { SessionDetailPage } from "../features/sessions/SessionDetailPage";
import { createSplClientFromProfile } from "./createSplClient";
import { applyCurrentAccountToProfile, hasCurrentAccountProfileChanged } from "../features/connection/accountProfile";
import type { SecondPassClient } from "@secondpass/client";
import { saveReaderReturnTarget } from "../features/reader/readerReturnTarget";
import type { ReaderReturnTarget } from "../features/reader/types";

export default function App() {
  const DEBUG_NAV = import.meta.env.DEV;
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [openedBook, setOpenedBook] = useState<OpenedBook | null>(null);
  const [view, setView] = useState<"main" | "settings">("main");
  const [route, setRoute] = useState<AppRoute | null>(() => parseCurrentRoute());
  const [readerRestoreError, setReaderRestoreError] = useState<string | null>(null);
  const [readerRestoreAttempt, setReaderRestoreAttempt] = useState(0);
  const [appTheme, setAppTheme] = useState<AppTheme>(() => getAppTheme());

  const selectedProfile = useMemo(() => {
    void profilesVersion;
    return getActiveConnection();
  }, [profilesVersion]);
  const selectedProfileId = selectedProfile?.id ?? null;

  const splClient: SecondPassClient | null = useMemo(() => {
    if (!selectedProfile?.apiBaseUrl || !selectedProfile?.accessToken) return null;
    return createSplClientFromProfile(selectedProfile);
  }, [selectedProfile?.apiBaseUrl, selectedProfile?.accessToken, selectedProfile?.tokenType]);

  const workflowStep = useMemo(() => getAppWorkflowStep(selectedProfile), [selectedProfile]);

  const openingBookRef = useRef<string | null>(null);
  const navSeqRef = useRef(0);
  const lastMeCheckRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const handler = () => setRoute(parseCurrentRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = appTheme;
    document.documentElement.style.colorScheme = appTheme === "dark" ? "dark" : appTheme === "light" ? "light" : "";
    saveAppTheme(appTheme);
  }, [appTheme]);

  useEffect(() => {
    if (!DEBUG_NAV) return;
    // eslint-disable-next-line no-console
    console.log("[nav] route", route);
  }, [route]);

  const checkMe = useCallback(async () => {
    // Keep verified user display fresh on page load and periodic focus changes.
    if (workflowStep !== "library_home") return;
    if (!selectedProfile?.id) return;
    if (!selectedProfile.apiBaseUrl || !selectedProfile.accessToken || !splClient) return;

    const profileId = selectedProfile.id;
    const now = Date.now();
    const last = lastMeCheckRef.current[profileId] ?? 0;
    if (now - last < 60_000) return; // throttle (avoid spamming)
    lastMeCheckRef.current[profileId] = now;

    try {
      const me = await splClient.account.getCurrent();
      const nextProfile = applyCurrentAccountToProfile(selectedProfile, me, new Date().toISOString(), {
        markVerified: false,
      });
      const changed = hasCurrentAccountProfileChanged(selectedProfile, nextProfile);

      if (!changed) return;

      saveConnectionProfile(nextProfile);
      refreshProfiles();
    } catch {
      // ignore: keep existing verified identity if refresh fails
    }
  }, [selectedProfile, splClient, workflowStep]);

  useEffect(() => {
    void checkMe();
  }, [checkMe]);

  useEffect(() => {
    if (workflowStep !== "library_home") return;
    const onFocus = () => {
      void checkMe();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkMe, workflowStep]);

  // Bump a sequence number on any route change so async opens can be cancelled logically.
  useEffect(() => {
    navSeqRef.current += 1;
  }, [route]);

  useEffect(() => {
    if (route?.kind === "settings") setView("settings");
    else setView("main");
  }, [route?.kind]);

  useEffect(() => {
    // Default route selection when hash is empty.
    if (route) return;
    if (workflowStep === "library_home") navigateTo({ kind: "home" }, { replace: true });
    else navigateTo({ kind: "connect" }, { replace: true });
  }, [route, workflowStep]);

  useEffect(() => {
    // Workflow still wins over invalid routes (never bypass auth/verification).
    if (workflowStep === "connect_server") {
      if (route?.kind !== "connect") navigateTo({ kind: "connect" }, { replace: true });
      return;
    }
    if (workflowStep === "pair_device") {
      if (route?.kind !== "pair") navigateTo({ kind: "pair" }, { replace: true });
      return;
    }
    if (workflowStep === "verify_connection") {
      if (route?.kind !== "verify") navigateTo({ kind: "verify" }, { replace: true });
      return;
    }

    // Verified: allow main app routes. Unknown routes fall back to home.
    if (workflowStep === "library_home") {
      if (!route || route.kind === "unknown") {
        navigateTo({ kind: "home" }, { replace: true });
        return;
      }
      if (route.kind === "connect" || route.kind === "pair" || route.kind === "verify") {
        navigateTo({ kind: "home" }, { replace: true });
      }
    }
  }, [route, workflowStep]);

  useEffect(() => {
    const base = "Second Pass Reader";
    if (!route) {
      document.title = base;
      return;
    }
    switch (route.kind) {
      case "home":
        document.title = `${base} - Home`;
        return;
      case "library":
        document.title = `${base} - Library`;
        return;
      case "shelves":
        document.title = `${base} - Shelves`;
        return;
      case "shelf":
        document.title = `${base} - Shelves`;
        return;
      case "shelfEdit":
        document.title = `${base} - Edit Shelf`;
        return;
      case "sessions":
        document.title = `${base} - Session Management`;
        return;
      case "session":
        document.title = `${base} - Session Management`;
        return;
      case "settings":
        document.title = `${base} - Settings`;
        return;
      case "reader":
        document.title = openedBook?.book?.title ? `${base} - ${openedBook.book.title}` : `${base} - Reader`;
        return;
      case "connect":
        document.title = `${base} - Connect`;
        return;
      case "pair":
        document.title = `${base} - Pair`;
        return;
      case "verify":
        document.title = `${base} - Verify`;
        return;
      case "unknown":
        document.title = base;
        return;
    }
  }, [openedBook?.book?.title, route]);

  useEffect(() => {
    // Leaving reader route closes reader state (do not keep blobs around).
    if (!openedBook) return;
    if (route?.kind === "reader") return;
    handleCloseReader();
  }, [openedBook, route?.kind]);

  useEffect(() => {
    // Reader route restore/open: on reload (or direct navigation) open the requested book.
    if (workflowStep !== "library_home") return;
    if (!route || route.kind !== "reader") return;
    if (!selectedProfile?.apiBaseUrl || !selectedProfile?.accessToken || !splClient) return;

    const requestedBookId = route.bookId;
    if (openedBook?.book?.id === requestedBookId) return;
    if (openingBookRef.current === requestedBookId) return;

    setReaderRestoreError(null);
    openingBookRef.current = requestedBookId;

    // React dev StrictMode intentionally mounts/unmounts components twice to detect unsafe effects.
    // Guard async work so the first mount's async does not "win" or interfere with the second mount.
    let cancelled = false;

    void (async () => {
      const seq = navSeqRef.current;
      try {
        const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<T>((_resolve, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
          });
          try {
            return await Promise.race([promise, timeoutPromise]);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        };

        const book = await withTimeout(
          splClient.library.books.get(requestedBookId),
          30_000,
          "Loading book details",
        );
        if (cancelled) return;
        if (seq !== navSeqRef.current) return;
        const opened = await openBookForReader({ spl: splClient, book });
        if (cancelled) return;
        if (seq !== navSeqRef.current) return;
        handleBookOpened(opened);
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof ApiError && e.status === 404
            ? "That book could not be found or you do not have access to it."
            : e instanceof Error
              ? e.message
              : "Failed to open book.";
        setReaderRestoreError(message);
        navigateTo({ kind: "home" });
      } finally {
        if (openingBookRef.current === requestedBookId) openingBookRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      // In React StrictMode (dev), effects are mounted/unmounted twice. If we leave the guard set
      // during the simulated unmount, the second mount run will be incorrectly blocked.
      if (openingBookRef.current === requestedBookId) {
        openingBookRef.current = null;
      }
    };
  }, [
    openedBook?.book?.id,
    route,
    selectedProfile,
    workflowStep,
    readerRestoreAttempt,
    splClient,
  ]);

  function refreshProfiles() {
    setProfilesVersion((v) => v + 1);
  }

  function handleBookOpened(opened: OpenedBook) {
    // If the user navigated away from the reader route while this book was opening, do not re-open it.
    if (route?.kind !== "reader") return;
    setOpenedBook((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return opened;
    });
    navigateTo({ kind: "reader", bookId: String(opened.book.id), search: route.search });
  }

  function handleCloseReader() {
    if (DEBUG_NAV) {
      // eslint-disable-next-line no-console
      console.log("[nav] handleCloseReader()");
    }
    setOpenedBook((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
    openingBookRef.current = null;
  }

  function getReaderReturnTargetForRoute(currentRoute: AppRoute | null): ReaderReturnTarget {
    if (!currentRoute) return { kind: "home", label: "Home", route: "#/home" };
    if (currentRoute.kind === "library") {
      return {
        kind: currentRoute.browse === "series" && currentRoute.seriesId ? "series" : "library",
        label: currentRoute.browse === "series" && currentRoute.seriesId ? "Series" : "Library",
        route: routeToHash(withoutBookModal(currentRoute)),
        seriesId: currentRoute.browse === "series" ? currentRoute.seriesId : undefined,
      };
    }
    if (currentRoute.kind === "shelves") {
      return {
        kind: "shelves",
        label: "Shelves",
        route: routeToHash(withoutBookModal(currentRoute)),
      };
    }
    if (currentRoute.kind === "shelf") {
      return {
        kind: "shelf",
        label: "Shelf",
        route: routeToHash(withoutBookModal(currentRoute)),
        shelfId: currentRoute.shelfId,
      };
    }
    if (currentRoute.kind === "sessions") {
      return {
        kind: "sessions",
        label: "Reading sessions",
        route: routeToHash(currentRoute),
      };
    }
    if (currentRoute.kind === "session") {
      return {
        kind: "sessions",
        label: "Session detail",
        route: routeToHash(currentRoute),
        sessionId: currentRoute.sessionId,
      };
    }
    return { kind: "home", label: "Home", route: "#/home" };
  }

  function openReaderWithReturnTarget(bookId: string | number, returnTarget: ReaderReturnTarget) {
    const id = String(bookId);
    saveReaderReturnTarget(id, returnTarget);
    navigateTo({ kind: "reader", bookId: id });
  }

  function returnToConnect(options?: { replace?: boolean }) {
    clearActiveConnection();
    handleCloseReader();
    refreshProfiles();
    setView("main");
    navigateTo({ kind: "connect" }, options);
  }

  function handleForgetServer() {
    returnToConnect();
  }

  function handleCancelPairing() {
    returnToConnect({ replace: true });
  }

  return (
    <div className={`appShell ${openedBook && route?.kind === "reader" ? "appShellReader" : ""}`}>
      {openedBook && route?.kind === "reader" ? null : (
        <AppHeader
          profile={selectedProfile}
          view={view}
          route={route}
          canNavigate={workflowStep === "library_home"}
          onShowHome={() => {
            navigateTo({ kind: "home" });
            handleCloseReader();
          }}
          onShowLibrary={() => {
            navigateTo({ kind: "library" });
            handleCloseReader();
          }}
          onShowSessions={() => {
            navigateTo({ kind: "sessions" });
            handleCloseReader();
          }}
          onShowShelves={() => {
            navigateTo({ kind: "shelves" });
            handleCloseReader();
          }}
          onShowSettings={() => {
            navigateTo({ kind: "settings", tab: "appearance" });
            handleCloseReader();
          }}
        />
      )}

      <main className="appMain">
        {view === "settings" ? (
          <>
            <SettingsPanel
              profile={selectedProfile}
              onProfilesChanged={refreshProfiles}
              onForgetServer={handleForgetServer}
              appTheme={appTheme}
              onAppThemeChange={setAppTheme}
              route={route?.kind === "settings" ? route : { kind: "settings" }}
            />
          </>
        ) : (
          <>
            {workflowStep === "connect_server" ? (
              <ConnectServerScreen
                selectedProfileId={selectedProfileId}
                onSelectedProfileIdChange={() => undefined}
                onProfilesChanged={refreshProfiles}
              />
            ) : null}

            {workflowStep === "pair_device" ? (
              <ClientApiLinking
                selectedProfileId={selectedProfileId}
                onProfilesChanged={refreshProfiles}
                profilesVersion={profilesVersion}
                onCancel={handleCancelPairing}
              />
            ) : null}

            {workflowStep === "verify_connection" ? (
              <section className="panel workflowPanel">
                <h2 className="panelTitle">Verify connection</h2>
                <ServerSummary profile={selectedProfile} />
                <ClientApiVerification
                  selectedProfileId={selectedProfileId}
                  profilesVersion={profilesVersion}
                  onProfilesChanged={refreshProfiles}
                  autoVerify
                />
              </section>
            ) : null}

            {workflowStep === "library_home" ? (
              route?.kind === "reader" && !openedBook ? (
                <section className="panel workflowPanel">
                  <h2 className="panelTitle">Opening book</h2>
                  {readerRestoreError ? <div className="errorText">{readerRestoreError}</div> : <p className="muted">{`Restoring reader${"\u2026"}`}</p>}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="button buttonCompact"
                      onClick={() => {
                        navigateTo({ kind: "home" });
                        handleCloseReader();
                      }}
                    >
                      Home
                    </button>
                    <button
                      type="button"
                      className="button buttonCompact"
                      onClick={() => {
                        // Force re-run of the reader restore effect by clearing the in-flight guard.
                        openingBookRef.current = null;
                        setReaderRestoreError(null);
                        setReaderRestoreAttempt((v) => v + 1);
                      }}
                    >
                      Retry
                    </button>
                  </div>
                </section>
              ) : openedBook && route?.kind === "reader" ? (
                <section className="readerScreen">
                  <ReadingActivity
                    openedBook={openedBook}
                    onBackToLibrary={() => {
                      navigateTo({ kind: "home" });
                      handleCloseReader();
                    }}
                    spl={splClient}
                    initialSearchQuery={route.search ?? null}
                  />
                </section>
              ) : route?.kind === "shelves" ? (
                <div className="libraryScreen">
                  <ShelvesPage
                    profile={selectedProfile}
                    spl={splClient}
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
              ) : route?.kind === "shelf" ? (
                <div className="libraryScreen">
                  <ShelfDetailPage
                    profile={selectedProfile}
                    spl={splClient}
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
              ) : route?.kind === "shelfEdit" ? (
                <div className="libraryScreen">
                  <ShelfEditPage profile={selectedProfile} spl={splClient} shelfId={route.shelfId} />
                </div>
              ) : route?.kind === "sessions" ? (
                <div className="libraryScreen">
                  <SessionsPage profile={selectedProfile} spl={splClient} bookId={route.bookId ?? null} searchQuery={route.q ?? ""} />
                </div>
              ) : route?.kind === "session" ? (
                <div className="libraryScreen">
                  <SessionDetailPage profile={selectedProfile} spl={splClient} sessionId={route.sessionId} />
                </div>
              ) : route?.kind === "library" ? (
                <div className="libraryScreen">
                  <LibraryBrowsePage
                    profile={selectedProfile}
                    spl={splClient}
                    route={{
                      q: route.q,
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
                      // Committing search clears browse/series/author.
                      navigateTo(next
                        ? { kind: "library", q: next, tag: route.tag, ordering: "title", page: 1, pageSize: route.pageSize ?? 20, bookId: route.bookId }
                        : { kind: "library", browse: "books", tag: route.tag, ordering: "title", page: 1, pageSize: route.pageSize ?? 20, bookId: route.bookId });
                    }}
                    onShowBooks={() => {
                      navigateTo({ kind: "library", browse: "books", tag: route.tag, ordering: "title", page: 1, pageSize: route.pageSize ?? 20, bookId: route.bookId });
                    }}
                    onShowSeries={() => {
                      navigateTo({ kind: "library", browse: "series", tag: route.tag, ordering: "name", page: 1, pageSize: route.pageSize ?? 20, bookId: route.bookId });
                    }}
                    onShowAuthors={() => {
                      navigateTo({ kind: "library", browse: "authors", tag: route.tag, ordering: "name", page: 1, pageSize: route.pageSize ?? 20, bookId: route.bookId });
                    }}
                    onShowGroups={() => {
                      navigateTo({ kind: "library", browse: "groups", tag: route.tag, ordering: "name", page: 1, pageSize: route.pageSize ?? 20, bookId: route.bookId });
                    }}
                    onShowSeriesBooks={(seriesId) => {
                      navigateTo({ kind: "library", browse: "series", seriesId, tag: route.tag, ordering: "series_index", page: 1, pageSize: route.pageSize ?? 20, bookId: route.bookId });
                    }}
                    onShowAuthorBooks={(authorId) => {
                      navigateTo({ kind: "library", browse: "authors", authorId, tag: route.tag, ordering: "title", page: 1, pageSize: route.pageSize ?? 20, bookId: route.bookId });
                    }}
                    onShowGroupBooks={(groupId) => {
                      navigateTo({ kind: "library", browse: "groups", groupId, tag: route.tag, ordering: "title", page: 1, pageSize: route.pageSize ?? 20, bookId: route.bookId });
                    }}
                    onUpdateRoute={(patch) => {
                      navigateTo({
                        kind: "library",
                        q: route.q,
                        browse: route.browse ?? "books",
                        seriesId: route.seriesId,
                        authorId: route.authorId,
                        groupId: route.groupId,
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
              ) : (
                <div className="libraryScreen">
                  <HomePage profile={selectedProfile} spl={splClient} />
                </div>
              )
            ) : null}
          </>
        )}
      </main>

      {workflowStep === "library_home" && route?.kind !== "reader" ? (
        (() => {
          const modalBookId =
            route?.kind === "home" ? route.bookId ?? null : route?.kind === "library" ? route.bookId ?? null : route?.kind === "shelves" ? route.bookId ?? null : route?.kind === "shelf" ? route.bookId ?? null : null;
          if (!modalBookId) return null;
          return (
            <BookDetailModal
              profile={selectedProfile}
              spl={splClient}
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
              launchMessage={null}
              downloadState={{ phase: "idle" }}
            />
          );
        })()
      ) : null}
    </div>
  );
}

function ServerSummary({ profile }: { profile: ConnectionProfile | null }) {
  if (!profile) return <p className="muted">No library connected.</p>;
  return (
    <div className="serverSummary">
      <div className="detailRow">
        <span className="muted">Library:</span> {profile.serverName ?? profile.label}
      </div>
      <div className="detailRow">
        <span className="muted">Server URL:</span> <span className="mono">{profile.serverBaseUrl}</span>
      </div>
      {profile.serverName ? (
        <div className="detailRow">
          <span className="muted">Name:</span> {profile.serverName}
        </div>
      ) : null}
      {profile.serverDescription ? (
        <div className="detailRow">
          <span className="muted">Description:</span> {profile.serverDescription}
        </div>
      ) : null}
      {profile.apiBaseUrl ? (
        <div className="detailRow">
          <span className="muted">API base:</span> <span className="mono">{profile.apiBaseUrl}</span>
        </div>
      ) : null}
    </div>
  );
}
