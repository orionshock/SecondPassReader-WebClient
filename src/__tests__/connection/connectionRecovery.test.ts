import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError } from "@secondpass/client";
import { describe, expect, it } from "vitest";
import { ConnectionRecoveryBannerForState } from "../../app/ConnectionRecoveryBanner.UI";
import { reduceAuthenticationRepairRequired, reduceAuthorizationFailure } from "../../app/ConnectionRecovery.Context";

describe("top-level connection recovery", () => {
  it("shows the recovery banner after an authorization failure is reported", () => {
    const authorizationFailure = reduceAuthorizationFailure(false, authError());
    const html = renderToStaticMarkup(createElement(ConnectionRecoveryBannerForState, {
      authorizationFailure,
      hasConnection: true,
      route: { kind: "home" },
    }));

    expect(html).toContain('href="#/settings?tab=library-server"');
  });

  it("offers credential repair for an authentication rejection", () => {
    const html = renderToStaticMarkup(createElement(ConnectionRecoveryBannerForState, {
      authorizationFailure: true,
      authenticationRepairRequired: true,
      hasConnection: true,
      route: { kind: "home" },
    }));

    expect(html).toContain("Repair connection");
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

  it("shows recoverable route unavailability without calling it an auth failure", () => {
    const html = renderToStaticMarkup(createElement(ConnectionRecoveryBannerForState, {
      authorizationFailure: false,
      routeRecoveryState: "unavailable",
      hasConnection: true,
      route: { kind: "home" },
    }));

    expect(html).toContain("Library connection unavailable");
    expect(html).toContain("offline data is still available");
    expect(html).toContain("View connection");
  });

  it("enters credential repair only for authentication rejection", () => {
    expect(reduceAuthenticationRepairRequired(false, new ApiError({ kind: "unauthorized", status: 401, message: "No" }))).toBe(true);
    expect(reduceAuthenticationRepairRequired(false, authError())).toBe(false);
  });

  it("hides the banner on Settings > Second Pass Library", () => {
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
