import { describe, expect, it } from "vitest";
import { deriveApiRootUrl, isLibraryBaseUrl } from "../ServerRoute.Policy";

describe("Library base URL convention", () => {
  it.each([
    ["https://library.example.com", "https://library.example.com/api/v1/"],
    ["https://library.example.com:8443/", "https://library.example.com:8443/api/v1/"],
    ["https://library.example.com:443/", "https://library.example.com:443/api/v1/"],
    ["http://localhost:8000/", "http://localhost:8000/api/v1/"],
  ])("derives the API root from %s", (base, expected) => {
    expect(deriveApiRootUrl(base)).toBe(expected);
  });

  it.each(["https://library.example.com/path", "https://library.example.com/?q=1", "ftp://library.example.com"])(
    "rejects unsupported base URL %s", (url) => {
      expect(isLibraryBaseUrl(url)).toBe(false);
      expect(() => deriveApiRootUrl(url)).toThrow();
    },
  );
});
