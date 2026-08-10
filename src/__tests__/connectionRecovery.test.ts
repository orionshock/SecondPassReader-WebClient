import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError } from "@secondpass/client";
import { describe, expect, it } from "vitest";
import { ConnectionRecoveryBannerForState } from "../app/ConnectionRecovery.Banner";
import { reduceAuthorizationFailure } from "../app/ConnectionRecovery.Context";

describe("top-level connection recovery", () => {
  it("shows the recovery banner after an authorization failure is reported", () => {
    const authorizationFailure = reduceAuthorizationFailure(false, authError());
    const html = renderToStaticMarkup(createElement(ConnectionRecoveryBannerForState, {
      authorizationFailure,
      hasConnection: true,
      route: { kind: "home" },
    }));

    expect(html).toContain("This device is no longer authorized by the library server.");
    expect(html).toContain("Manage the connection to log out, forget this device, or pair again.");
    expect(html).toContain('href="#/settings?tab=library-server"');
  });

  it("does not show the banner for a non-authorization failure", () => {
    const authorizationFailure = reduceAuthorizationFailure(false, new Error("Network unavailable."));
    const html = renderToStaticMarkup(createElement(ConnectionRecoveryBannerForState, {
      authorizationFailure,
      hasConnection: true,
      route: { kind: "library" },
    }));

    expect(html).toBe("");
  });

  it("hides the banner on Settings > Library Server", () => {
    const html = renderToStaticMarkup(createElement(ConnectionRecoveryBannerForState, {
      authorizationFailure: true,
      hasConnection: true,
      route: { kind: "settings", tab: "library-server" },
    }));

    expect(html).toBe("");
  });

  it("does not show the banner without a configured connection", () => {
    const html = renderToStaticMarkup(createElement(ConnectionRecoveryBannerForState, {
      authorizationFailure: true,
      hasConnection: false,
      route: { kind: "home" },
    }));

    expect(html).toBe("");
  });
});

function authError(): ApiError {
  return new ApiError({ kind: "forbidden", status: 403, message: "Token is not allowed." });
}
