export type AppRoute =
  | { kind: "connect" }
  | { kind: "pair" }
  | { kind: "verify" }
  | { kind: "home" }
  | { kind: "library"; q?: string }
  | { kind: "libraryBook"; bookId: string; q?: string }
  | { kind: "shelves" }
  | { kind: "settings" }
  | { kind: "reader"; bookId: string }
  | { kind: "unknown"; raw: string };

function normalizeHash(hash: string): string {
  const h = (hash ?? "").trim();
  if (!h) return "";
  return h.startsWith("#") ? h.slice(1) : h;
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
      return "#/home";
    case "library":
      return route.q ? `#/library?q=${encodeURIComponent(route.q)}` : "#/library";
    case "libraryBook": {
      const base = `#/library/${encodeURIComponent(route.bookId)}`;
      return route.q ? `${base}?q=${encodeURIComponent(route.q)}` : base;
    }
    case "shelves":
      return "#/shelves";
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

  const head = parts[0];
  if (head === "connect") return { kind: "connect" };
  if (head === "pair") return { kind: "pair" };
  if (head === "verify") return { kind: "verify" };
  if (head === "home") return { kind: "home" };
  if (head === "library") {
    const q = queryParams.get("q")?.trim() ?? "";
    if (typeof parts[1] === "string" && parts[1]) {
      try {
        const bookId = decodeURIComponent(parts[1]);
        return q ? { kind: "libraryBook", bookId, q } : { kind: "libraryBook", bookId };
      } catch {
        return q ? { kind: "libraryBook", bookId: parts[1], q } : { kind: "libraryBook", bookId: parts[1] };
      }
    }
    return q ? { kind: "library", q } : { kind: "library" };
  }
  if (head === "shelves") return { kind: "shelves" };
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
