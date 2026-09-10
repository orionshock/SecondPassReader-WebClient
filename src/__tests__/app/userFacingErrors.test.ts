import { describe, expect, it } from "vitest";
import {
  getAuthRecoveryMessage,
  getPageLoadErrorMessage,
  isAuthenticationRepairError,
  isAuthorizationError,
} from "../../app/AppUserFacingErrors.Mapper";
import { apiError } from "./ApiErrorTest.Fixtures";

describe("user-facing API errors", () => {
  it("classifies 401 and 403 API errors as authorization failures", () => {
    expect(isAuthorizationError(apiError(401, "Unauthorized"))).toBe(true);
    expect(isAuthorizationError(apiError(403, "Forbidden"))).toBe(true);
  });

  it("requires credential repair for 401 but not authority drift", () => {
    expect(isAuthenticationRepairError(apiError(401, "Unauthorized"))).toBe(true);
    expect(isAuthenticationRepairError(apiError(403, "Forbidden"))).toBe(false);
    expect(isAuthenticationRepairError(apiError(404, "Not found"))).toBe(false);
  });

  it("classifies token-not-allowed messages as authorization failures", () => {
    expect(isAuthorizationError(apiError(404, "Token is not allowed to access this endpoint."))).toBe(true);
    expect(isAuthorizationError(new Error("Reader token is currently not allowed here."))).toBe(true);
  });

  it("does not classify an ordinary 404 as an authorization failure", () => {
    expect(isAuthorizationError(apiError(404, "Book not found."))).toBe(false);
  });

  it("returns the page-specific authorization fallback", () => {
    expect(getPageLoadErrorMessage(
      apiError(403, "Forbidden"),
      "Could not load library results.",
      getAuthRecoveryMessage("access the library"),
    )).toBe("This device is not authorized to access the library.");
  });

  it("returns the page-specific generic fallback for other load errors", () => {
    expect(getPageLoadErrorMessage(
      new Error("fetch failed"),
      "Could not load library results.",
      "This device is not authorized to access the library.",
    )).toBe("Could not load library results.");
  });
});
