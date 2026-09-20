export function isLibraryBaseUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && Boolean(url.hostname)
      && url.pathname === "/"
      && !url.search
      && !url.hash
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export function deriveApiRootUrl(libraryBaseUrl: string): string {
  return `${normalizeLibraryBaseUrl(libraryBaseUrl)}/api/v1/`;
}

export function normalizeLibraryBaseUrl(libraryBaseUrl: string): string {
  if (!isLibraryBaseUrl(libraryBaseUrl)) throw new Error("Invalid Library base URL.");
  const url = new URL(libraryBaseUrl);
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(libraryBaseUrl)?.[1] ?? "";
  const explicitPort = /:(\d+)$/.exec(authority)?.[1];
  return explicitPort && !url.port ? `${url.origin}:${explicitPort}` : url.origin;
}
