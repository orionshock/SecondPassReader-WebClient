import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function readGit(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function resolveBuildValue(environmentName: string, gitArgs: string[], fallback: string): string {
  const environmentValue = process.env[environmentName]?.trim();
  return environmentValue || readGit(gitArgs) || fallback;
}

const appVersion = resolveBuildValue(
  "SECONDPASS_WEBCLIENT_VERSION",
  ["describe", "--tags", "--always", "--dirty"],
  "development",
);
const appReleaseDate = resolveBuildValue(
  "SECONDPASS_WEBCLIENT_RELEASE_DATE",
  ["log", "-1", "--format=%cs"],
  "unknown",
);

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    "import.meta.env.VITE_APP_RELEASE_DATE": JSON.stringify(appReleaseDate),
  },
});
