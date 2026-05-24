import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClientApiLinking, ClientApiVerification, ConnectServerScreen } from "../features/connection";
import { LibraryLandingPage } from "../features/library";
import { HomePage } from "../features/home/HomePage";
import { ReaderArea, type OpenedBook } from "../features/reader";
import { DebugDetails } from "./DebugDetails";
import { getAppWorkflowStep } from "./appWorkflow";
import type { LibraryBook } from "../schemas/library";
import type { AppRoute } from "./navigation";
import { navigateTo, parseCurrentRoute, withBookModal, withoutBookModal } from "./navigation";
import {
  deleteConnectionProfile,
  getConnectionProfile,
  listConnectionProfiles,
} from "../storage/connectionProfiles";
import { AppHeader } from "./AppHeader";
import { SettingsPanel } from "./SettingsPanel";
import { openBookForReader } from "../features/library/openBookForReader";
import { ApiError, SecondPassApiClient } from "../api/SecondPassApiClient";
import { ShelvesPage } from "../features/shelves/ShelvesPage";
import { ShelfDetailPage } from "../features/shelves/ShelfDetailPage";
import { BookDetailModal } from "../features/library/BookDetailModal";

const SELECTED_PROFILE_KEY = "secondpass.selectedConnectionProfileId.v1";

export default function App() {
  const DEBUG_NAV = import.meta.env.DEV;
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [openedBook, setOpenedBook] = useState<OpenedBook | null>(null);
  const [view, setView] = useState<"main" | "settings">("main");
  const [route, setRoute] = useState<AppRoute | null>(() => parseCurrentRoute());
  const [readerRestoreError, setReaderRestoreError] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SELECTED_PROFILE_KEY);
    } catch {
      return null;
    }
  });

  const selectedProfile = useMemo(() => {
    if (!selectedProfileId) return null;
    return getConnectionProfile(selectedProfileId) ?? null;
  }, [selectedProfileId, profilesVersion]);

  const workflowStep = useMemo(() => getAppWorkflowStep(selectedProfile), [selectedProfile]);

  const openingBookRef = useRef<string | null>(null);
  const navSeqRef = useRef(0);

  useEffect(() => {
    const handler = () => setRoute(parseCurrentRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    if (!DEBUG_NAV) return;
    // eslint-disable-next-line no-console
    console.log("[nav] route", route);
  }, [route]);

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

    // Verified: allow library/settings/reader. Unknown routes fall back to library.
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
    if (!selectedProfile?.apiBaseUrl || !selectedProfile?.accessToken) return;
    const apiBaseUrl = selectedProfile.apiBaseUrl;
    const accessToken = selectedProfile.accessToken;

    const requestedBookId = route.bookId;
    if (openedBook?.book?.id === requestedBookId) return;
    if (openingBookRef.current === requestedBookId) return;

    setReaderRestoreError(null);
    openingBookRef.current = requestedBookId;

    void (async () => {
      const seq = navSeqRef.current;
      try {
        const api = new SecondPassApiClient({ serverBaseUrl: selectedProfile.serverBaseUrl });
        const book = await api.getBook({
          apiBaseUrl,
          accessToken,
          tokenType: selectedProfile.tokenType ?? "Bearer",
          bookId: requestedBookId,
        });
        if (seq !== navSeqRef.current) return;
        const opened = await openBookForReader({ profile: selectedProfile, book });
        if (seq !== navSeqRef.current) return;
        handleBookOpened(opened);
      } catch (e) {
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
  }, [
    openedBook?.book?.id,
    route,
    selectedProfile,
    workflowStep,
  ]);

  useEffect(() => {
    const profiles = listConnectionProfiles();
    if (selectedProfileId && profiles.some((p) => p.id === selectedProfileId)) return;
    if (profiles.length === 0) {
      setSelectedProfileId(null);
      return;
    }
    setSelectedProfileId(profiles[0].id);
  }, []);

  useEffect(() => {
    try {
      if (selectedProfileId) localStorage.setItem(SELECTED_PROFILE_KEY, selectedProfileId);
      else localStorage.removeItem(SELECTED_PROFILE_KEY);
    } catch {
      // ignore storage errors
    }
  }, [selectedProfileId]);

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
    navigateTo({ kind: "reader", bookId: String(opened.book.id) });
  }

  async function handleOpenBookFromReader(book: LibraryBook) {
    // Route is canonical; App's reader-route effect owns opening/restoring the book.
    navigateTo({ kind: "reader", bookId: String(book.id) });
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

  function handleForgetServer() {
    if (!selectedProfileId) return;
    deleteConnectionProfile(selectedProfileId);
    setSelectedProfileId(null);
    handleCloseReader();
    refreshProfiles();
    setView("main");
    navigateTo({ kind: "connect" });
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
          onShowShelves={() => {
            navigateTo({ kind: "shelves" });
            handleCloseReader();
          }}
          onShowSettings={() => {
            if (view === "settings") navigateTo({ kind: "home" });
            else navigateTo({ kind: "settings" });
          }}
        />
      )}

      <main className="appMain">
        {view === "settings" ? (
          <>
            <SettingsPanel
              profile={selectedProfile}
              selectedProfileId={selectedProfileId}
              onSelectedProfileIdChange={setSelectedProfileId}
              onProfilesChanged={refreshProfiles}
              profilesVersion={profilesVersion}
              onForgetServer={handleForgetServer}
            />
            <DebugDetails step={workflowStep} selectedProfileId={selectedProfileId} profile={selectedProfile} />
          </>
        ) : (
          <>
            {workflowStep === "connect_server" ? (
              <ConnectServerScreen
                selectedProfileId={selectedProfileId}
                onSelectedProfileIdChange={setSelectedProfileId}
                onProfilesChanged={refreshProfiles}
              />
            ) : null}

            {workflowStep === "pair_device" ? (
              <section className="panel workflowPanel">
                <h2 className="panelTitle">Pair this device</h2>
                <ServerSummary profile={selectedProfile} />
                <ClientApiLinking
                  selectedProfileId={selectedProfileId}
                  onProfilesChanged={refreshProfiles}
                  profilesVersion={profilesVersion}
                />
              </section>
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
                  {readerRestoreError ? <div className="errorText">{readerRestoreError}</div> : <p className="muted">Restoring reader…</p>}
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
                  </div>
                </section>
              ) : openedBook && route?.kind === "reader" ? (
                <section className="readerScreen">
                  <ReaderArea
                    openedBook={openedBook}
                    onBackToLibrary={() => {
                      navigateTo({ kind: "home" });
                      handleCloseReader();
                    }}
                    apiBaseUrl={selectedProfile?.apiBaseUrl}
                    accessToken={selectedProfile?.accessToken}
                    tokenType={selectedProfile?.tokenType}
                    onOpenBook={handleOpenBookFromReader}
                  />
                </section>
              ) : route?.kind === "shelves" ? (
                <div className="libraryScreen">
                  <ShelvesPage profile={selectedProfile} />
                </div>
              ) : route?.kind === "shelf" ? (
                <div className="libraryScreen">
                  <ShelfDetailPage profile={selectedProfile} shelfId={route.shelfId} />
                </div>
              ) : route?.kind === "library" ? (
                <div className="libraryScreen">
                  <LibraryLandingPage
                    profile={selectedProfile}
                    route={{
                      q: route.q,
                      browse: route.browse,
                      seriesId: route.seriesId,
                      authorId: route.authorId,
                    }}
                    selectedBookId={route.bookId ?? null}
                    onViewBook={(bookId) => {
                      navigateTo(withBookModal(route, bookId));
                    }}
                    onCommitSearch={(q) => {
                      const next = q.trim();
                      // Committing search clears browse/series/author.
                      navigateTo(next ? { kind: "library", q: next, bookId: route.bookId } : { kind: "library", bookId: route.bookId });
                    }}
                    onShowBooks={() => {
                      navigateTo({ kind: "library", bookId: route.bookId });
                    }}
                    onShowSeries={() => {
                      navigateTo({ kind: "library", browse: "series", bookId: route.bookId });
                    }}
                    onShowAuthors={() => {
                      navigateTo({ kind: "library", browse: "authors", bookId: route.bookId });
                    }}
                    onShowSeriesBooks={(seriesId) => {
                      navigateTo({ kind: "library", browse: "series", seriesId, bookId: route.bookId });
                    }}
                    onShowAuthorBooks={(authorId) => {
                      navigateTo({ kind: "library", browse: "authors", authorId, bookId: route.bookId });
                    }}
                  />
                </div>
              ) : (
                <div className="libraryScreen">
                  <HomePage profile={selectedProfile} />
                </div>
              )
            ) : null}
          </>
        )}
      </main>

      {workflowStep === "library_home" && route?.kind !== "reader" ? (
        (() => {
          const modalBookId =
            route?.kind === "home" ? route.bookId ?? null : route?.kind === "library" ? route.bookId ?? null : route?.kind === "shelf" ? route.bookId ?? null : null;
          if (!modalBookId) return null;
          return (
            <BookDetailModal
              profile={selectedProfile}
              bookId={modalBookId}
              initialBook={null}
              onClose={() => {
                if (!route) return;
                navigateTo(withoutBookModal(route), { replace: true });
              }}
              onOpenReader={(book) => {
                navigateTo({ kind: "reader", bookId: String(book.id) });
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

function ServerSummary({ profile }: { profile: ReturnType<typeof getConnectionProfile> | null }) {
  if (!profile) return <p className="muted">No profile selected.</p>;
  return (
    <div className="serverSummary">
      <div className="detailRow">
        <span className="muted">Profile:</span> {profile.label}
      </div>
      <div className="detailRow">
        <span className="muted">Server:</span> <span className="mono">{profile.serverBaseUrl}</span>
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
