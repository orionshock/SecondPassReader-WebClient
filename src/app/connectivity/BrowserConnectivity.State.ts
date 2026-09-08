export type BrowserConnectivityStatus = "online" | "offline" | "unknown";

type ConnectivityListener = () => void;

const listeners = new Set<ConnectivityListener>();

let currentStatus: BrowserConnectivityStatus | null = null;
let subscribedWindow: Window | null = null;

function readBrowserConnectivity(): BrowserConnectivityStatus {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
    return "unknown";
  }
  return navigator.onLine ? "online" : "offline";
}

function handleBrowserConnectivityChange(): void {
  const nextStatus = readBrowserConnectivity();
  if (nextStatus === currentStatus) return;

  currentStatus = nextStatus;
  for (const listener of [...listeners]) listener();
}

function attachBrowserListeners(): void {
  if (subscribedWindow || typeof window === "undefined") return;

  subscribedWindow = window;
  subscribedWindow.addEventListener("online", handleBrowserConnectivityChange);
  subscribedWindow.addEventListener("offline", handleBrowserConnectivityChange);
}

function detachBrowserListeners(): void {
  if (!subscribedWindow) return;

  subscribedWindow.removeEventListener("online", handleBrowserConnectivityChange);
  subscribedWindow.removeEventListener("offline", handleBrowserConnectivityChange);
  subscribedWindow = null;
}

export function getBrowserConnectivitySnapshot(): BrowserConnectivityStatus {
  return currentStatus ?? readBrowserConnectivity();
}

export function subscribeToBrowserConnectivity(listener: ConnectivityListener): () => void {
  if (listeners.size === 0) currentStatus = readBrowserConnectivity();
  listeners.add(listener);
  attachBrowserListeners();

  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;

    listeners.delete(listener);
    if (listeners.size > 0) return;

    detachBrowserListeners();
    currentStatus = null;
  };
}
