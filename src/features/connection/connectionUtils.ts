import type { SecondPassDiscovery } from "@secondpass/client";
import { createSecondPassClient } from "@secondpass/client";

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
    throw new Error("That server URL doesn't look valid. Example: http://localhost:8000");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server URL must start with http:// or https://");
  }

  const serverBaseUrl = `${url.origin}`.replace(/\/+$/, "");
  return { serverBaseUrl };
}

export async function discoverSecondPass(serverBaseUrl: string): Promise<SecondPassDiscovery> {
  try {
    return await createSecondPassClient({ apiBaseUrl: "", accessToken: "", tokenType: "Bearer" }).server.discover(serverBaseUrl);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Discovery failed.";
    throw new Error(message);
  }
}
