#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const summaryPath = resolve(repoRoot, "coverage", "coverage-summary.json");
const minimums = {
  files: 300,
  appFiles: 280,
  sdkFiles: 8,
  executableLines: 8000,
};

function repositoryPath(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function main() {
  let summary;
  try {
    summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  } catch (error) {
    throw new Error(`Coverage universe check could not read coverage/coverage-summary.json: ${error.message}`);
  }

  const files = Object.keys(summary).filter((path) => path !== "total").map(repositoryPath);
  const appFiles = files.filter((path) => path.startsWith("src/"));
  const sdkFiles = files.filter((path) => path.startsWith("packages/secondpass-client/src/"));
  const executableLines = summary.total?.lines?.total;
  const observed = {
    files: files.length,
    appFiles: appFiles.length,
    sdkFiles: sdkFiles.length,
    executableLines: Number.isFinite(executableLines) ? executableLines : 0,
  };
  const failures = Object.entries(minimums)
    .filter(([name, minimum]) => observed[name] < minimum)
    .map(([name, minimum]) => `${name}=${observed[name]} (minimum ${minimum})`);

  console.log(
    `Coverage universe: ${observed.files} files `
      + `(${observed.appFiles} app, ${observed.sdkFiles} SDK), ${observed.executableLines} executable lines.`,
  );
  if (failures.length > 0) {
    throw new Error(`Coverage universe is implausibly small: ${failures.join(", ")}. Check coverage include/exclude globs.`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
