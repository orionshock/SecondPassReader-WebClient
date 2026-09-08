import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserConnectivitySnapshot,
  subscribeToBrowserConnectivity,
} from "../app/connectivity/BrowserConnectivity.State";
import type { BrowserConnectivityStatus } from "../app/connectivity/BrowserConnectivity.State";

describe("browser connectivity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads an online browser snapshot", () => {
    stubNavigatorOnline(true);

    expect(getBrowserConnectivitySnapshot()).toBe("online");
  });

  it("reads an offline browser snapshot", () => {
    stubNavigatorOnline(false);

    expect(getBrowserConnectivitySnapshot()).toBe("offline");
  });

  it("publishes offline and online transitions", () => {
    const browserWindow = new EventTarget();
    let online = true;
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("navigator", {
      get onLine() {
        return online;
      },
    });
    const transitions: BrowserConnectivityStatus[] = [];
    const unsubscribe = subscribeToBrowserConnectivity(() => {
      transitions.push(getBrowserConnectivitySnapshot());
    });

    online = false;
    browserWindow.dispatchEvent(new Event("offline"));
    online = true;
    browserWindow.dispatchEvent(new Event("online"));

    expect(transitions).toEqual(["offline", "online"]);
    unsubscribe();
  });

  it("stops notifications after unsubscribe", () => {
    const browserWindow = new EventTarget();
    let online = true;
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("navigator", {
      get onLine() {
        return online;
      },
    });
    const listener = vi.fn();
    const unsubscribe = subscribeToBrowserConnectivity(listener);

    unsubscribe();
    online = false;
    browserWindow.dispatchEvent(new Event("offline"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("returns unknown without browser globals", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("navigator", undefined);

    expect(getBrowserConnectivitySnapshot()).toBe("unknown");
    expect(() => subscribeToBrowserConnectivity(() => undefined)()).not.toThrow();
  });
});

function stubNavigatorOnline(online: boolean): void {
  vi.stubGlobal("navigator", { onLine: online });
}
