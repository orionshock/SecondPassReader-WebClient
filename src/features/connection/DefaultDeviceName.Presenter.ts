const APP_LABEL = "SecondPass Reader";
const SEPARATOR = "\u00b7";
const FALLBACK_NAME = `${APP_LABEL} ${SEPARATOR} Browser`;

type UserAgentBrand = {
  brand: string;
  version?: string;
};

export type BrowserIdentitySource = {
  userAgentData?: {
    brands?: UserAgentBrand[];
    platform?: string;
  } | null;
  userAgent?: string;
  platform?: string;
};

function detectBrowserFromBrands(brands: UserAgentBrand[] | undefined): string | null {
  const names = (brands ?? []).map((entry) => entry.brand.toLowerCase());
  if (names.some((brand) => brand.includes("microsoft edge"))) return "Edge";
  if (names.some((brand) => brand.includes("google chrome"))) return "Chrome";
  if (names.some((brand) => brand === "chromium")) return "Chrome";
  if (names.some((brand) => brand.includes("firefox"))) return "Firefox";
  return null;
}

function detectBrowserFromUserAgent(userAgent: string): string | null {
  if (/\bEdg(?:A|iOS)?\//i.test(userAgent)) return "Edge";
  if (/\bFxiOS\//i.test(userAgent) || /\bFirefox\//i.test(userAgent)) return "Firefox";
  if (/\bCriOS\//i.test(userAgent) || /\bChrome\//i.test(userAgent)) return "Chrome";
  if (/\bSafari\//i.test(userAgent) && /\bVersion\//i.test(userAgent)) return "Safari";
  return null;
}

function normalizePlatform(platform: string): string | null {
  const value = platform.toLowerCase();
  if (value.includes("iphone")) return "iPhone";
  if (value.includes("ipad")) return "iPad";
  if (value.includes("android")) return "Android";
  if (value.includes("windows") || value.startsWith("win")) return "Windows";
  if (value.includes("mac")) return "macOS";
  if (value.includes("linux")) return "Linux";
  return null;
}

function detectDeviceFromUserAgent(userAgent: string): string | null {
  if (/\biPhone\b/i.test(userAgent)) return "iPhone";
  if (/\biPad\b/i.test(userAgent)) return "iPad";
  if (/\bAndroid\b/i.test(userAgent)) return "Android";
  if (/\bWindows\b/i.test(userAgent)) return "Windows";
  if (/\bMacintosh\b|\bMac OS X\b/i.test(userAgent)) return "macOS";
  if (/\bLinux\b/i.test(userAgent)) return "Linux";
  return null;
}

function readBrowserIdentity(): BrowserIdentitySource {
  if (typeof navigator === "undefined") return {};
  const browserNavigator = navigator as Navigator & {
    userAgentData?: BrowserIdentitySource["userAgentData"];
  };
  return {
    userAgentData: browserNavigator.userAgentData,
    userAgent: browserNavigator.userAgent,
    platform: browserNavigator.platform,
  };
}

export function buildDefaultDeviceName(source: BrowserIdentitySource = readBrowserIdentity()): string {
  const userAgent = source.userAgent ?? "";
  const browser =
    detectBrowserFromBrands(source.userAgentData?.brands) ??
    detectBrowserFromUserAgent(userAgent);
  const device =
    normalizePlatform(source.userAgentData?.platform ?? "") ??
    detectDeviceFromUserAgent(userAgent) ??
    normalizePlatform(source.platform ?? "");

  return browser && device ? `${APP_LABEL} ${SEPARATOR} ${browser} on ${device}` : FALLBACK_NAME;
}
