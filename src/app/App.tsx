import "./App.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientApiLinking } from "../features/connection/ClientApiLinking";
import { ClientApiVerification } from "../features/connection/ClientApiVerification";
import { ConnectServerScreen } from "../features/connection/ConnectServerScreen";
import type { OpenedBook } from "../features/reader/Reader.Types";
import { getAppWorkflowStep } from "./appWorkflow";
import type { AppRoute } from "./navigation";
import { navigateTo, parseCurrentRoute } from "./navigation";
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
import { createSplClientFromProfile } from "./createSplClient";
import { applyAuthenticatedContextToProfile, hasCurrentAccountProfileChanged } from "../features/connection/accountProfile";
import type { SecondPassClient } from "@secondpass/client";
import { releaseOpenedBook, resolveReaderOpenCompletion } from "../features/reader/ReaderOpen.Lifecycle";
import { ConnectionRecoveryProvider, useConnectionRecovery } from "./ConnectionRecoveryContext";
import { ConnectionRecoveryBannerForState } from "./ConnectionRecoveryBanner";
import { loadAuthenticatedContext } from "../features/connection/authenticatedContext";
import { debugLog } from "../lib/debug/DebugLogger";
import { AppBookDetailModalController } from "./routes/AppBookDetailModal.Controller";
import { AppLibraryRouteRenderer } from "./routes/AppLibraryRoute.Renderer";

function AppShell() {
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [openedBook, setOpenedBook] = useState<OpenedBook | null>(null);
  const activeOpenedBookRef = useRef<OpenedBook | null>(null);
  const [view, setView] = useState<"main" | "settings">("main");
  const [route, setRoute] = useState<AppRoute | null>(() => parseCurrentRoute());
  const [readerRestoreError, setReaderRestoreError] = useState<string | null>(null);
  const [readerRestoreAttempt, setReaderRestoreAttempt] = useState(0);
  const [appTheme, setAppTheme] = useState<AppTheme>(() => getAppTheme());
  const {
    authorizationFailure,
    clearAuthorizationFailure,
    reportAuthorizationFailure,
  } = useConnectionRecovery();

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
  const routeRef = useRef<AppRoute | null>(route);
  routeRef.current = route;
  const lastMeCheckRef = useRef<Record<string, number>>({});
  const connectionIdentityRef = useRef(`${selectedProfileId ?? ""}:${selectedProfile?.accessToken ?? ""}`);

  useEffect(() => {
    const nextIdentity = `${selectedProfileId ?? ""}:${selectedProfile?.accessToken ?? ""}`;
    if (connectionIdentityRef.current !== nextIdentity) clearAuthorizationFailure();
    connectionIdentityRef.current = nextIdentity;
  }, [clearAuthorizationFailure, selectedProfile?.accessToken, selectedProfileId]);

  useEffect(() => {
    if (route?.kind === "settings" && route.tab === "library-server") {
      clearAuthorizationFailure();
    }
  }, [clearAuthorizationFailure, route]);

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
    debugLog("reader", "route changed", {
      kind: route?.kind ?? null,
      bookId: route?.kind === "reader" ? route.bookId : undefined,
    });
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
      const { currentUser, serverInfo } = await loadAuthenticatedContext(splClient);
      clearAuthorizationFailure();
      const nextProfile = applyAuthenticatedContextToProfile(selectedProfile, currentUser, serverInfo, new Date().toISOString(), {
        markVerified: false,
      });
      const changed = hasCurrentAccountProfileChanged(selectedProfile, nextProfile);

      if (!changed) return;

      saveConnectionProfile(nextProfile);
      refreshProfiles();
    } catch (error) {
      reportAuthorizationFailure(error);
      // ignore: keep existing verified identity if refresh fails
    }
  }, [clearAuthorizationFailure, reportAuthorizationFailure, selectedProfile, splClient, workflowStep]);

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
        const currentRoute = routeRef.current;
        const currentOpened = resolveReaderOpenCompletion(
          opened,
          !cancelled
            && seq === navSeqRef.current
            && currentRoute?.kind === "reader"
            && currentRoute.bookId === requestedBookId,
        );
        if (!currentOpened) return;
        handleBookOpened(currentOpened);
      } catch (e) {
        if (cancelled) return;
        reportAuthorizationFailure(e);
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
    reportAuthorizationFailure,
    splClient,
  ]);

  function refreshProfiles() {
    setProfilesVersion((v) => v + 1);
  }

  function handleConnectionChanged() {
    clearAuthorizationFailure();
    refreshProfiles();
  }

  function handleBookOpened(opened: OpenedBook) {
    // If the user navigated away from the reader route while this book was opening, do not re-open it.
    if (route?.kind !== "reader") {
      releaseOpenedBook(opened);
      return;
    }
    const previous = activeOpenedBookRef.current;
    activeOpenedBookRef.current = opened;
    releaseOpenedBook(previous);
    setOpenedBook(opened);
    navigateTo({ kind: "reader", bookId: String(opened.book.id), search: route.search });
  }

  function handleCloseReader() {
    debugLog("reader", "reader closed");
    const active = activeOpenedBookRef.current;
    activeOpenedBookRef.current = null;
    releaseOpenedBook(active);
    setOpenedBook(null);
    openingBookRef.current = null;
  }

  function returnToConnect(options?: { replace?: boolean }) {
    clearAuthorizationFailure();
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

      <ConnectionRecoveryBannerForState
        authorizationFailure={authorizationFailure}
        hasConnection={Boolean(selectedProfile)}
        route={route}
      />

      <main className="appMain">
        {view === "settings" ? (
          <>
            <SettingsPanel
              profile={selectedProfile}
              onProfilesChanged={handleConnectionChanged}
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
                onProfilesChanged={handleConnectionChanged}
              />
            ) : null}

            {workflowStep === "pair_device" ? (
              <ClientApiLinking
                selectedProfileId={selectedProfileId}
                onProfilesChanged={handleConnectionChanged}
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
                  onProfilesChanged={handleConnectionChanged}
                  autoVerify
                />
              </section>
            ) : null}

            {workflowStep === "library_home" ? (
              <AppLibraryRouteRenderer
                route={route}
                profile={selectedProfile}
                spl={splClient}
                openedBook={openedBook}
                readerRestoreError={readerRestoreError}
                onCloseReader={handleCloseReader}
                onRetryReaderRestore={() => {
                  // Force re-run of the reader restore effect by clearing the in-flight guard.
                  openingBookRef.current = null;
                  setReaderRestoreError(null);
                  setReaderRestoreAttempt((v) => v + 1);
                }}
              />
            ) : null}
          </>
        )}
      </main>

      {workflowStep === "library_home" && route?.kind !== "reader" ? (
        <AppBookDetailModalController route={route} profile={selectedProfile} spl={splClient} />
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

export default function App() {
  return (
    <ConnectionRecoveryProvider>
      <AppShell />
    </ConnectionRecoveryProvider>
  );
}
