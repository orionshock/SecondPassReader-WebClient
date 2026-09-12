import type { SecondPassDiscovery } from "@secondpass/client";
import { createSecondPassClient } from "@secondpass/client";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

export class ConnectionSetupError extends Error {}

export function normalizeServerBaseUrl(input: string): { serverBaseUrl: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ConnectionSetupError("Enter a server URL.");
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new ConnectionSetupError("That server URL doesn't look valid. Example: http://localhost:8000");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConnectionSetupError("Server URL must start with http:// or https://");
  }

  const serverBaseUrl = `${url.origin}`.replace(/\/+$/, "");
  return { serverBaseUrl };
}

export async function discoverSecondPass(serverBaseUrl: string): Promise<SecondPassDiscovery> {
  try {
    return await createSecondPassClient({ apiBaseUrl: serverBaseUrl }).server.discover(serverBaseUrl);
  } catch (e) {
    debugWarn("reader", "Second Pass Library discovery did not complete", { serverBaseUrl, error: e });
    throw new ConnectionSetupError("Couldn't reach Second Pass Library. Check the address and try again.", { cause: e });
  }
}

export async function verifySecondPassServer(
  input: string,
  discover: (serverBaseUrl: string) => Promise<SecondPassDiscovery> = discoverSecondPass,
) {
  const { serverBaseUrl } = normalizeServerBaseUrl(input);
  const discovery = await discover(serverBaseUrl);
  return { serverBaseUrl, discovery };
}
