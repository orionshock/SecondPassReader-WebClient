import { describe, expect, it } from "vitest";
import { buildDefaultDeviceName } from "../features/connection/defaultDeviceName";

describe("buildDefaultDeviceName", () => {
  it("prefers userAgentData brands and platform", () => {
    expect(
      buildDefaultDeviceName({
        userAgentData: {
          brands: [
            { brand: "Chromium", version: "126" },
            { brand: "Microsoft Edge", version: "126" },
          ],
          platform: "Windows",
        },
        userAgent: "ignored",
      }),
    ).toBe("SecondPass Reader \u00b7 Edge on Windows");
  });

  it("detects Chrome on Windows from userAgent", () => {
    expect(
      buildDefaultDeviceName({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      }),
    ).toBe("SecondPass Reader \u00b7 Chrome on Windows");
  });

  it("detects Firefox on Linux from userAgent", () => {
    expect(
      buildDefaultDeviceName({
        userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
      }),
    ).toBe("SecondPass Reader \u00b7 Firefox on Linux");
  });

  it("detects Safari on iPhone from userAgent", () => {
    expect(
      buildDefaultDeviceName({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
          "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      }),
    ).toBe("SecondPass Reader \u00b7 Safari on iPhone");
  });

  it("uses navigator.platform only as a fallback", () => {
    expect(
      buildDefaultDeviceName({
        userAgent: "Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36",
        platform: "Win32",
      }),
    ).toBe("SecondPass Reader \u00b7 Chrome on Windows");
  });

  it("falls back without exposing uncertain browser data", () => {
    expect(buildDefaultDeviceName({})).toBe("SecondPass Reader \u00b7 Browser");
    expect(buildDefaultDeviceName({ userAgent: "CustomAgent/1.0", platform: "Unknown" }))
      .toBe("SecondPass Reader \u00b7 Browser");
  });
});
