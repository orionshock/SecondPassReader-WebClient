export type AppRoute =
  | { kind: "connect" }
  | { kind: "pair" }
  | { kind: "verify" }
  | { kind: "home"; bookId?: string }
  | { kind: "library"; q?: string; bookId?: string }
  | { kind: "shelves" }
  | { kind: "shelf"; shelfId: string; bookId?: string }
  | { kind: "settings" }
  | { kind: "reader"; bookId: string }
  | { kind: "unknown"; raw: string };

function normalizeHash(hash: string): string {
  const h = (hash ?? "").trim();
  if (!h) return "";
  return h.startsWith("#") ? h.slice(1) : h;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (!v) continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    qs.set(k, trimmed);
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
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
    case "library":
      return `#/library${buildQuery({ q: route.q, book: route.bookId })}`;
    case "shelves":
      return "#/shelves";
    case "shelf":
      return `#/shelves/${encodeURIComponent(route.shelfId)}${buildQuery({ book: route.bookId })}`;
    case "settings":
      return "#/settings";
    case "reader":
      return `#/reader/${encodeURIComponent(route.bookId)}`;
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

  const head = parts[0];
  if (head === "connect") return { kind: "connect" };
  if (head === "pair") return { kind: "pair" };
  if (head === "verify") return { kind: "verify" };
  if (head === "home") return bookId ? { kind: "home", bookId } : { kind: "home" };
  if (head === "library") {
    const q = queryParams.get("q")?.trim() ?? "";
    // Old route format `#/library/<bookId>` is intentionally not supported anymore.
    if (typeof parts[1] === "string" && parts[1]) return { kind: "unknown", raw: window.location.hash };
    if (q && bookId) return { kind: "library", q, bookId };
    if (q) return { kind: "library", q };
    return bookId ? { kind: "library", bookId } : { kind: "library" };
  }
  if (head === "shelves") {
    if (typeof parts[1] === "string" && parts[1]) {
      try {
        return bookId ? { kind: "shelf", shelfId: decodeURIComponent(parts[1]), bookId } : { kind: "shelf", shelfId: decodeURIComponent(parts[1]) };
      } catch {
        return bookId ? { kind: "shelf", shelfId: parts[1], bookId } : { kind: "shelf", shelfId: parts[1] };
      }
    }
    return { kind: "shelves" };
  }
  if (head === "settings") return { kind: "settings" };
  if (head === "reader" && typeof parts[1] === "string" && parts[1]) {
    try {
      return { kind: "reader", bookId: decodeURIComponent(parts[1]) };
    } catch {
      return { kind: "reader", bookId: parts[1] };
    }
  }

  return { kind: "unknown", raw: window.location.hash };
}

export function navigateTo(route: AppRoute, options?: { replace?: boolean }): void {
  const hash = routeToHash(route);
  if (options?.replace) {
    window.history.replaceState(null, "", hash);
    // Ensure listeners fire consistently across browsers.
    if (window.location.hash !== hash) window.location.hash = hash;
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
    default:
      return route;
  }
}
