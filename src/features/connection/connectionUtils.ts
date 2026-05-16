import type { SecondPassDiscovery } from "../../schemas/clientApiAuth";

export function normalizeServerBaseUrl(input: string): { serverBaseUrl: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Please enter a server URL.");
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("That server URL doesn’t look valid. Example: http://localhost:8000");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server URL must start with http:// or https://");
  }

  const serverBaseUrl = `${url.origin}`.replace(/\/+$/, "");
  return { serverBaseUrl };
}

export async function discoverSecondPass(serverBaseUrl: string): Promise<SecondPassDiscovery> {
  const url = `${serverBaseUrl}/.well-known/secondpass`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discovery failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
  }

  return (await res.json()) as SecondPassDiscovery;
}

