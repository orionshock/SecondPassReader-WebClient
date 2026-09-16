import { useCallback, useEffect, useRef, useState } from "react";
import type { MarginaliaRecentSessions, Shelf } from "@secondpass/client";
import { navigateTo } from "../../app/AppNavigation.Router";
import { saveReaderReturnTarget } from "../reader/ReaderReturnTarget.Store";
import { loadRecentReading } from "../reader/ReaderMarginalia.Queries";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";
import { HomePreviewLifetime } from "./HomePreview.Lifecycle";
import { cacheOfflineHomeRecent, cacheOfflineHomeShelves } from "./offline/OfflineHomeCache.Actions";

const RECENT_READING_ERROR = "Couldn't load Recent History.";

type RecentPublished = {
  lifetime: HomePreviewLifetime;
  busy: boolean;
  error: unknown;
  data: MarginaliaRecentSessions | null;
};

type ShelvesPublished = {
  lifetime: HomePreviewLifetime;
  busy: boolean;
  error: unknown;
  shelves: Shelf[] | null;
};

export type HomeRecentPreview = {
  busy: boolean;
  error: unknown;
  data: MarginaliaRecentSessions | null;
  canLoad: boolean;
  showClosed: boolean;
  toggleClosed(): void;
  retry(): void;
  resume(bookId: string | number): void;
};

export type HomeShelvesPreview = {
  busy: boolean;
  error: unknown;
  shelves: Shelf[] | null;
  canLoad: boolean;
  retry(): void;
};

export function useHomePreviewLifetime(
  client: HomePreviewLifetime["client"],
  namespaceKey: string | null,
): HomePreviewLifetime {
  const lifetimeRef = useRef<HomePreviewLifetime | null>(null);
  if (!lifetimeRef.current?.matches(client, namespaceKey)) {
    lifetimeRef.current?.invalidate();
    lifetimeRef.current = new HomePreviewLifetime(client, namespaceKey);
  }
  const lifetime = lifetimeRef.current;
  useEffect(() => () => lifetime.invalidate(), [lifetime]);
  return lifetime;
}

export function useHomeRecentPreview(lifetime: HomePreviewLifetime): HomeRecentPreview {
  const [published, setPublished] = useState<RecentPublished>(() => ({
    lifetime,
    busy: false,
    error: null,
    data: null,
  }));
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    if (!lifetime.client) return;
    const request = lifetime.begin("recent");
    setPublished((current) => ({ ...current, lifetime, busy: true, error: null }));
    try {
      const result = await loadRecentReading(lifetime.client, { includeClosed: showClosed });
      if (!request.isCurrent()) return;
      setPublished({ lifetime, data: result, busy: false, error: null });
      const publication = request.publication;
      if (publication && Array.isArray(result.results)) {
        void cacheOfflineHomeRecent(
          { namespaceKey: publication.namespaceKey, items: result.results },
          publication,
        ).catch(() => undefined);
      }
    } catch (reason) {
      if (!request.isCurrent()) return;
      setPublished({
        lifetime,
        data: null,
        busy: false,
        error: reason instanceof Error ? reason : new Error(RECENT_READING_ERROR),
      });
    } finally {
      if (request.isCurrent()) setPublished((current) => ({ ...current, lifetime, busy: false }));
    }
  }, [lifetime, showClosed]);

  useEffect(() => {
    setPublished({ lifetime, data: null, error: null, busy: false });
    if (lifetime.client) void load();
    return () => lifetime.invalidate("recent");
  }, [lifetime, load]);

  const resume = useCallback((bookId: string | number) => {
    const bookKey = String(bookId);
    setPublished((current) => ({ ...current, error: null }));
    try {
      saveReaderReturnTarget(bookKey, { kind: "home", label: "Home", route: "#/home" });
      navigateTo({ kind: "reader", bookId: bookKey });
    } catch (reason) {
      setPublished((current) => ({
        ...current,
        error: reason instanceof Error ? reason : new Error("Couldn't resume reading."),
      }));
    }
  }, []);

  const current = published.lifetime === lifetime
    ? published
    : { lifetime, data: null, error: null, busy: false };
  return {
    busy: current.busy,
    error: current.error,
    data: current.data,
    canLoad: Boolean(lifetime.client),
    showClosed,
    toggleClosed: () => setShowClosed((current) => !current),
    retry: () => { void load(); },
    resume,
  };
}

export function useHomeShelvesPreview(lifetime: HomePreviewLifetime): HomeShelvesPreview {
  const [published, setPublished] = useState<ShelvesPublished>(() => ({
    lifetime,
    busy: false,
    error: null,
    shelves: null,
  }));

  const load = useCallback(async () => {
    if (!lifetime.client) return;
    const request = lifetime.begin("shelves");
    setPublished((current) => ({ ...current, lifetime, busy: true, error: null }));
    try {
      const result = await lifetime.client.shelves.list({ pageSize: 6, includePreviewBooks: true });
      if (!request.isCurrent()) return;
      const items = result.results ?? [];
      setPublished({ lifetime, shelves: items, busy: false, error: null });
      const publication = request.publication;
      if (publication && Array.isArray(result.results)) {
        void cacheOfflineHomeShelves(
          { namespaceKey: publication.namespaceKey, items },
          publication,
        ).catch(() => undefined);
      }
    } catch (reason) {
      if (!request.isCurrent()) return;
      debugWarn("reader", "Home shelf preview could not be loaded", { error: reason });
      setPublished({
        lifetime,
        shelves: null,
        busy: false,
        error: reason instanceof Error ? reason : new Error("Couldn't load shelves."),
      });
    } finally {
      if (request.isCurrent()) setPublished((current) => ({ ...current, lifetime, busy: false }));
    }
  }, [lifetime]);

  useEffect(() => {
    setPublished({ lifetime, shelves: null, error: null, busy: false });
    if (lifetime.client) void load();
    return () => lifetime.invalidate("shelves");
  }, [lifetime, load]);

  const current = published.lifetime === lifetime
    ? published
    : { lifetime, shelves: null, error: null, busy: false };
  return {
    busy: current.busy,
    error: current.error,
    shelves: current.shelves,
    canLoad: Boolean(lifetime.client),
    retry: () => { void load(); },
  };
}
