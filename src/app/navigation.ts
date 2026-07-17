export type AppRoute =
  | { kind: "connect" }
  | { kind: "pair" }
  | { kind: "verify" }
  | { kind: "home"; bookId?: string }
  | {
      kind: "library";
      q?: string;
      browse?: "books" | "series" | "authors" | "groups";
      seriesId?: string;
      authorId?: string;
      groupId?: string;
      tag?: string;
      view?: "list" | "grid";
      ordering?: string;
      page?: number;
      pageSize?: number;
      bookId?: string;
    }
  | { kind: "sessions"; bookId?: string; q?: string }
  | { kind: "session"; sessionId: string }
  | { kind: "shelves"; bookId?: string; ordering?: string; page?: number; pageSize?: number }
  | { kind: "shelf"; shelfId: string; bookId?: string; ordering?: string; page?: number; pageSize?: number }
  | { kind: "shelfEdit"; shelfId: string }
  | { kind: "settings"; tab?: SettingsTab }
  | { kind: "reader"; bookId: string; search?: string }
  | { kind: "unknown"; raw: string };

export type SettingsTab = "appearance" | "library-server" | "tools";

function normalizeHash(hash: string): string {
  const h = (hash ?? "").trim();
  if (!h) return "";
  return h.startsWith("#") ? h.slice(1) : h;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    const trimmed = String(v).trim();
    if (!trimmed) continue;
    qs.set(k, trimmed);
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const DEFAULT_PAGE_SIZE = 20;

function nonDefaultPage(page?: number): number | undefined {
  return typeof page === "number" && page > 1 ? page : undefined;
}

function nonDefaultPageSize(pageSize?: number): number | undefined {
  return typeof pageSize === "number" && pageSize !== DEFAULT_PAGE_SIZE ? pageSize : undefined;
}

function getDefaultLibraryOrdering(route: Extract<AppRoute, { kind: "library" }>): string {
  if (route.q) return "title";
  if (route.browse === "series" && route.seriesId) return "series_index";
  if (route.browse === "series") return "name";
  if (route.browse === "authors" && route.authorId) return "title";
  if (route.browse === "authors") return "name";
  if (route.browse === "groups" && route.groupId) return "title";
  if (route.browse === "groups") return "name";
  return "title";
}

function nonDefaultOrdering(ordering: string | undefined, defaultOrdering: string): string | undefined {
  return ordering && ordering !== defaultOrdering ? ordering : undefined;
}

export function routeToHash(route: AppRoute): string {
  switch (route.kind) {
    case "connect":
      return "#/connect";
    case "pair":
      return "#/pair";
    case "verify":
      return "#/verify";
    case "home":
      return `#/home${buildQuery({ book: route.bookId })}`;
    case "library": {
      const browse = route.browse ?? "books";
      return `#/library${buildQuery({
        q: route.q,
        browse: !route.q && browse !== "books" ? browse : undefined,
        series: !route.q && browse === "series" ? route.seriesId : undefined,
        author: !route.q && browse === "authors" ? route.authorId : undefined,
        group: !route.q && browse === "groups" ? route.groupId : undefined,
        tag: route.tag,
        ordering: nonDefaultOrdering(route.ordering, getDefaultLibraryOrdering(route)),
        page: nonDefaultPage(route.page),
        page_size: nonDefaultPageSize(route.pageSize),
        view: route.view,
        book: route.bookId,
      })}`;
    }
    case "sessions":
      return `#/sessions${buildQuery({ book: route.bookId, q: route.q })}`;
    case "session":
      return `#/sessions/${encodeURIComponent(route.sessionId)}`;
    case "shelves":
      return `#/shelves${buildQuery({
        ordering: nonDefaultOrdering(route.ordering, "name"),
        page: nonDefaultPage(route.page),
        page_size: nonDefaultPageSize(route.pageSize),
        book: route.bookId,
      })}`;
    case "shelf":
      return `#/shelves/${encodeURIComponent(route.shelfId)}${buildQuery({
        ordering: nonDefaultOrdering(route.ordering, "position"),
        page: nonDefaultPage(route.page),
        page_size: nonDefaultPageSize(route.pageSize),
        book: route.bookId,
      })}`;
    case "shelfEdit":
      return `#/shelves/${encodeURIComponent(route.shelfId)}/edit`;
    case "settings":
      return `#/settings${buildQuery({ tab: route.tab ?? "appearance" })}`;
    case "reader":
      return `#/reader/${encodeURIComponent(route.bookId)}${buildQuery({ search: route.search })}`;
    case "unknown":
      return route.raw.startsWith("#") ? route.raw : `#${route.raw}`;
  }
}

export function parseCurrentRoute(): AppRoute | null {
  const raw = normalizeHash(window.location.hash);
  if (!raw) return null;

  const [pathPart, queryPart] = raw.split("?", 2);
  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const queryParams = new URLSearchParams(queryPart ?? "");
  const bookId = queryParams.get("book")?.trim() ?? "";
  const ordering = queryParams.get("ordering")?.trim() || undefined;
  const pageRaw = queryParams.get("page")?.trim() ?? "";
  const pageSizeRaw = queryParams.get("page_size")?.trim() ?? "";
  const pageParsed = Number(pageRaw);
  const pageSizeParsed = Number(pageSizeRaw);
  const page = Number.isInteger(pageParsed) && pageParsed > 0 ? pageParsed : undefined;
  const pageSize = Number.isInteger(pageSizeParsed) && pageSizeParsed > 0 ? pageSizeParsed : undefined;

  const head = parts[0];
  if (head === "connect") return { kind: "connect" };
  if (head === "pair") return { kind: "pair" };
  if (head === "verify") return { kind: "verify" };
  if (head === "home") return bookId ? { kind: "home", bookId } : { kind: "home" };
  if (head === "library") {
    const q = queryParams.get("q")?.trim() ?? "";
    const browseRaw = queryParams.get("browse")?.trim() ?? "";
    const browse = browseRaw === "series" || browseRaw === "authors" || browseRaw === "groups" || browseRaw === "books" ? browseRaw : "";
    const viewRaw = queryParams.get("view")?.trim() ?? "";
    const view = viewRaw === "list" || viewRaw === "grid" ? viewRaw : undefined;
    const seriesId = queryParams.get("series")?.trim() ?? "";
    const authorId = queryParams.get("author")?.trim() ?? "";
    const groupId = queryParams.get("group")?.trim() ?? "";
    const tag = queryParams.get("tag")?.trim() || undefined;
    // Old route format `#/library/<bookId>` is intentionally not supported anymore.
    if (typeof parts[1] === "string" && parts[1]) return { kind: "unknown", raw: window.location.hash };

    if (q) {
      return bookId ? { kind: "library", q, tag, view, ordering, page, pageSize, bookId } : { kind: "library", q, tag, view, ordering, page, pageSize };
    }

    const effectiveBrowse: "books" | "series" | "authors" | "groups" =
      browse === "series" || browse === "authors" || browse === "groups" || browse === "books" ? (browse as any) : "books";

    if (effectiveBrowse === "series") {
      return {
        kind: "library",
        browse: "series",
        seriesId: seriesId || undefined,
        tag,
        view,
        ordering,
        page,
        pageSize,
        bookId: bookId || undefined,
      };
    }
    if (effectiveBrowse === "authors") {
      return {
        kind: "library",
        browse: "authors",
        authorId: authorId || undefined,
        tag,
        view,
        ordering,
        page,
        pageSize,
        bookId: bookId || undefined,
      };
    }
    if (effectiveBrowse === "groups") {
      return {
        kind: "library",
        browse: "groups",
        groupId: groupId || undefined,
        tag,
        view,
        ordering,
        page,
        pageSize,
        bookId: bookId || undefined,
      };
    }
    return bookId
      ? { kind: "library", browse: "books", tag, view, ordering, page, pageSize, bookId }
      : { kind: "library", browse: "books", tag, view, ordering, page, pageSize };
  }
  if (head === "sessions") {
    if (typeof parts[1] === "string" && parts[1]) {
      try {
        return { kind: "session", sessionId: decodeURIComponent(parts[1]) };
      } catch {
        return { kind: "session", sessionId: parts[1] };
      }
    }
    const q = queryParams.get("q")?.trim() ?? "";
    if (bookId || q) return { kind: "sessions", bookId: bookId || undefined, q: q || undefined };
    return { kind: "sessions" };
  }
  if (head === "shelves") {
    if (typeof parts[1] === "string" && parts[1]) {
      const shelfId = (() => {
        try {
          return decodeURIComponent(parts[1]);
        } catch {
          return parts[1];
        }
      })();
      if (parts[2] === "edit") return { kind: "shelfEdit", shelfId };
      try {
        return bookId
          ? { kind: "shelf", shelfId: decodeURIComponent(parts[1]), ordering, page, pageSize, bookId }
          : { kind: "shelf", shelfId: decodeURIComponent(parts[1]), ordering, page, pageSize };
      } catch {
        return bookId
          ? { kind: "shelf", shelfId: parts[1], ordering, page, pageSize, bookId }
          : { kind: "shelf", shelfId: parts[1], ordering, page, pageSize };
      }
    }
    return bookId ? { kind: "shelves", ordering, page, pageSize, bookId } : { kind: "shelves", ordering, page, pageSize };
  }
  if (head === "settings") {
    const tabRaw = queryParams.get("tab")?.trim() ?? "";
    const tab: SettingsTab | undefined =
      tabRaw === "appearance" || tabRaw === "library-server" || tabRaw === "tools" ? tabRaw : undefined;
    return tab ? { kind: "settings", tab } : { kind: "settings" };
  }
  if (head === "reader" && typeof parts[1] === "string" && parts[1]) {
    const search = queryParams.get("search")?.trim() ?? "";
    try {
      const decodedBookId = decodeURIComponent(parts[1]);
      return search ? { kind: "reader", bookId: decodedBookId, search } : { kind: "reader", bookId: decodedBookId };
    } catch {
      return search ? { kind: "reader", bookId: parts[1], search } : { kind: "reader", bookId: parts[1] };
    }
  }

  return { kind: "unknown", raw: window.location.hash };
}

export function navigateTo(route: AppRoute, options?: { replace?: boolean }): void {
  const hash = routeToHash(route);
  if (options?.replace) {
    const oldUrl = window.location.href;
    const oldHash = window.location.hash;
    window.history.replaceState(null, "", hash);

    // `replaceState()` does not fire `hashchange`, but this app's route state is driven by `hashchange`.
    // Manually dispatch so UI updates (e.g., closing query-param modals) without pushing history entries.
    const newHash = window.location.hash;
    if (oldHash !== newHash) {
      const newUrl = window.location.href;
      try {
        // eslint-disable-next-line no-new
        const evt = new HashChangeEvent("hashchange", { oldURL: oldUrl, newURL: newUrl });
        window.dispatchEvent(evt);
      } catch {
        window.dispatchEvent(new Event("hashchange"));
      }
    }
    return;
  }
  window.location.hash = hash;
}

export function withBookModal(route: AppRoute, bookId: string): AppRoute {
  const id = bookId.trim();
  if (!id) return route;
  switch (route.kind) {
    case "home":
      return { ...route, bookId: id };
    case "library":
      return { ...route, bookId: id };
    case "shelf":
      return { ...route, bookId: id };
    default:
      return route;
  }
}

export function withoutBookModal(route: AppRoute): AppRoute {
  switch (route.kind) {
    case "home": {
      const { bookId: _bookId, ...rest } = route;
      return rest;
    }
    case "library": {
      const { bookId: _bookId, ...rest } = route;
      return rest;
    }
    case "shelf": {
      const { bookId: _bookId, ...rest } = route;
      return rest;
    }
    case "shelves": {
      const { bookId: _bookId, ...rest } = route;
      return rest;
    }
    default:
      return route;
  }
}
