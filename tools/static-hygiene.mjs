#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const skipDirNames = new Set([
  ".git",
  ".vite",
  ".venv",
  ".ruff_cache",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "userdata",
]);

const textExts = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const entityExts = new Set([".css", ".html", ".js", ".jsx", ".ts", ".tsx"]);
const productionSourceExts = new Set([".js", ".jsx", ".ts", ".tsx"]);
const directConsoleOwner = "src/lib/debug/DebugLogger.Diagnostics.ts";
const readerEngineRoot = "src/features/reader/engine/";
const forbiddenDecorativeEntities = [
  "&middot;",
  "&#183;",
  "&mdash;",
  "&ndash;",
  "&larr;",
  "&rarr;",
  "&hellip;",
];

const mojibakeMarkers = ["\u00c3", "\u00c2", "\u00e2"];
const mojibakeSeqReplacements = new Map([
  ["\u00e2\u20ac\u00a6", "..."],
  ["\u00e2\u20ac\u201d", "-"],
  ["\u00e2\u20ac\u201c", "-"],
  ["\u00e2\u20ac\u2122", "'"],
  ["\u00e2\u20ac\u02dc", "'"],
  ["\u00e2\u20ac\u0153", '"'],
  ["\u00e2\u20ac\u009d", '"'],
  ["\u00e2\u20ac\u017e", '"'],
  ["\u00c2\u00a0", " "],
  ["\u00c2\u00b7", "-"],
]);

const punctuationReplacements = new Map([
  ["\u2026", "..."],
  ["\u2014", "-"],
  ["\u2013", "-"],
  ["\u2019", "'"],
  ["\u2018", "'"],
  ["\u201c", '"'],
  ["\u201d", '"'],
  ["\u00a0", " "],
  ["\u00b7", "-"],
  ["\u2190", "<-"],
  ["\u2192", "->"],
  ["\u00a9", "(c)"],
  ["\u00ae", "(r)"],
]);

const nonAsciiPunctuation = new Map([
  ["\u2026", "ellipsis; use ..."],
  ["\u2014", "em dash; use - or --"],
  ["\u2013", "en dash; use -"],
  ["\u2019", "right smart quote; use '"],
  ["\u2018", "left smart quote; use '"],
  ["\u201c", 'left smart quote; use "'],
  ["\u201d", 'right smart quote; use "'],
  ["\u00a0", "non-breaking space; use regular space"],
  ["\u00b7", "middle dot; use ASCII punctuation or spacing"],
  ["\u2190", "left arrow; use <-"],
  ["\u2192", "right arrow; use ->"],
  ["\u00a9", "copyright sign; use (c)"],
  ["\u00ae", "registered sign; use (r)"],
]);

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function parseArgs(argv) {
  const args = {
    all: false,
    fix: false,
    fixLineEndings: false,
    fixMojibake: false,
    fixTrailingWhitespace: false,
    verbose: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--all") args.all = true;
    else if (arg === "--fix") args.fix = true;
    else if (arg === "--fix-line-endings") args.fixLineEndings = true;
    else if (arg === "--fix-mojibake") args.fixMojibake = true;
    else if (arg === "--fix-trailing-whitespace") args.fixTrailingWhitespace = true;
    else if (arg === "--verbose") args.verbose = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.fix) {
    args.fixLineEndings = true;
    args.fixTrailingWhitespace = true;
  }

  return args;
}

function usage() {
  return [
    "Usage: node tools/static-hygiene.mjs [options]",
    "",
    "Options:",
    "  --all                       Scan all tracked and untracked text files instead of touched files.",
    "  --fix                       Fix trailing whitespace and line endings.",
    "  --fix-trailing-whitespace   Trim trailing spaces and tabs.",
    "  --fix-line-endings          Normalize CRLF/CR line endings to LF.",
    "  --fix-mojibake              Repair likely mojibake and normalize known punctuation.",
    "  --verbose                   Print scanned files.",
    "  -h, --help                  Show this help.",
  ].join("\n");
}

function runGit(args) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function repoRelative(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function isSkipped(path) {
  return repoRelative(path).split("/").some((part) => skipDirNames.has(part));
}

function isTextCandidate(path) {
  return textExts.has(extname(path).toLowerCase());
}

function isBinary(path) {
  try {
    return readFileSync(path).subarray(0, 4096).includes(0);
  } catch {
    return true;
  }
}

function existingTextPaths(names) {
  const out = [];
  const seen = new Set();
  for (const name of names) {
    const path = isAbsolute(name) ? name : resolve(repoRoot, name);
    if (seen.has(path) || !existsSync(path) || !statSync(path).isFile()) continue;
    if (isSkipped(path) || !isTextCandidate(path) || isBinary(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out.sort((a, b) => repoRelative(a).localeCompare(repoRelative(b)));
}

function touchedFiles() {
  const names = new Set();
  for (const args of [
    ["diff", "--name-only", "--diff-filter=d"],
    ["diff", "--cached", "--name-only", "--diff-filter=d"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const result = runGit(args);
    if (result.status === 0) {
      for (const line of result.stdout.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (trimmed) names.add(trimmed);
      }
    }
  }
  return existingTextPaths([...names]);
}

function allTrackedFiles() {
  const result = runGit(["ls-files"]);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "git ls-files failed");
  }
  return existingTextPaths(result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean));
}

function allRepositoryFiles() {
  const paths = new Map();
  for (const path of [...allTrackedFiles(), ...touchedFiles()]) paths.set(path, path);
  return [...paths.values()];
}

function isProductionApplicationSource(path) {
  const name = repoRelative(path);
  return name.startsWith("src/")
    && productionSourceExts.has(extname(path).toLowerCase())
    && !name.includes("/__tests__/")
    && !/\.test\.[jt]sx?$/u.test(name);
}

function decodeUtf8(path) {
  try {
    return { text: utf8Decoder.decode(readFileSync(path)) };
  } catch (error) {
    return { error };
  }
}

function lineForOffset(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function issue(path, line, message) {
  return { path, line, message };
}

function checkUtf8(paths) {
  const issues = [];
  for (const path of paths) {
    const result = decodeUtf8(path);
    if (result.error) {
      issues.push(issue(path, null, `invalid UTF-8: ${result.error.message}`));
    }
  }
  return issues;
}

function checkMojibake(paths) {
  const issues = [];
  for (const path of paths) {
    const result = decodeUtf8(path);
    if (!result.text) continue;
    for (const marker of mojibakeMarkers) {
      const offset = result.text.indexOf(marker);
      if (offset !== -1) {
        issues.push(issue(path, lineForOffset(result.text, offset), "contains likely mojibake marker"));
        break;
      }
    }
  }
  return issues;
}

function checkNonAsciiPunctuation(paths) {
  const issues = [];
  for (const path of paths) {
    const result = decodeUtf8(path);
    if (!result.text) continue;
    for (const [char, message] of nonAsciiPunctuation) {
      let offset = result.text.indexOf(char);
      while (offset !== -1) {
        issues.push(issue(path, lineForOffset(result.text, offset), `non-ASCII punctuation: ${message}`));
        offset = result.text.indexOf(char, offset + char.length);
      }
    }
  }
  return issues;
}

function checkDecorativeEntities(paths) {
  const issues = [];
  for (const path of paths) {
    if (!entityExts.has(extname(path).toLowerCase())) continue;
    const result = decodeUtf8(path);
    if (!result.text) continue;
    const lines = result.text.split(/\n/u);
    lines.forEach((line, index) => {
      for (const token of forbiddenDecorativeEntities) {
        if (line.includes(token)) {
          issues.push(issue(path, index + 1, `decorative HTML entity ${token}`));
        }
      }
    });
  }
  return issues;
}

function checkTrailingWhitespace(paths) {
  const issues = [];
  for (const path of paths) {
    const result = decodeUtf8(path);
    if (!result.text) continue;
    const lines = result.text.split(/\n/u);
    lines.forEach((line, index) => {
      const body = line.endsWith("\r") ? line.slice(0, -1) : line;
      if (body.endsWith(" ") || body.endsWith("\t")) {
        issues.push(issue(path, index + 1, "trailing whitespace"));
      }
    });
  }
  return issues;
}

function checkLineEndings(paths) {
  const issues = [];
  for (const path of paths) {
    let data;
    try {
      data = readFileSync(path);
    } catch {
      continue;
    }
    const offset = data.indexOf(13);
    if (offset === -1) continue;
    const line = data.subarray(0, offset).filter((byte) => byte === 10).length + 1;
    const next = data.at(offset + 1);
    issues.push(issue(path, line, next === 10 ? "CRLF line ending; repo requires LF" : "CR line ending; repo requires LF"));
  }
  return issues;
}

function checkApplicationFetch(paths) {
  return checkProductionPattern(
    paths,
    /\bfetch\s*\(/gu,
    "raw fetch belongs in @secondpass/client; use the SDK transport interface",
  );
}

function checkDirectConsole(paths) {
  return checkProductionPattern(
    paths,
    /\bconsole\.[A-Za-z_$][\w$]*\s*\(/gu,
    "direct console use belongs in the canonical diagnostics owner",
    (path) => repoRelative(path) === directConsoleOwner,
  );
}

function checkEpubTsRuntimeImports(paths) {
  const issues = [];
  const patterns = [
    /\bimport\s+(?!type\b)[^;]*?\bfrom\s*["']@likecoin\/epub-ts(?:\/[^"']*)?["']/gu,
    /\bimport\s*["']@likecoin\/epub-ts(?:\/[^"']*)?["']/gu,
    /\bimport\s*\(\s*["']@likecoin\/epub-ts(?:\/[^"']*)?["']\s*\)/gu,
  ];
  for (const path of paths) {
    if (!isProductionApplicationSource(path) || repoRelative(path).startsWith(readerEngineRoot)) continue;
    const result = decodeUtf8(path);
    if (!result.text) continue;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of result.text.matchAll(pattern)) {
        issues.push(issue(
          path,
          lineForOffset(result.text, match.index),
          "runtime @likecoin/epub-ts imports belong under the Reader engine root; use the Reader bridge interface",
        ));
      }
    }
  }
  return issues;
}

function checkProductionPattern(paths, pattern, message, allow = () => false) {
  const issues = [];
  for (const path of paths) {
    if (!isProductionApplicationSource(path) || allow(path)) continue;
    const result = decodeUtf8(path);
    if (!result.text) continue;
    pattern.lastIndex = 0;
    for (const match of result.text.matchAll(pattern)) {
      issues.push(issue(path, lineForOffset(result.text, match.index), message));
    }
  }
  return issues;
}

function fixLineEndings(paths) {
  let changed = 0;
  for (const path of paths) {
    const original = readFileSync(path);
    const fixed = Buffer.from(original.toString("binary").replace(/\r\n?/gu, "\n"), "binary");
    if (!original.equals(fixed)) {
      writeFileSync(path, fixed);
      changed += 1;
    }
  }
  return changed;
}

function fixTrailingWhitespace(paths) {
  let changed = 0;
  for (const path of paths) {
    const result = decodeUtf8(path);
    if (!result.text) continue;
    const fixed = result.text.replace(/[ \t]+(\r?\n|$)/gu, "$1");
    if (fixed !== result.text) {
      writeFileSync(path, fixed, { encoding: "utf8" });
      changed += 1;
    }
  }
  return changed;
}

function decodeBestEffort(buffer) {
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function fixMojibakeText(text) {
  let candidate = text;
  if (mojibakeMarkers.some((marker) => text.includes(marker))) {
    for (const encoding of ["latin1"]) {
      try {
        candidate = Buffer.from(text, encoding).toString("utf8");
        break;
      } catch {
        candidate = text;
      }
    }
  }
  for (const [source, replacement] of mojibakeSeqReplacements) {
    candidate = candidate.replaceAll(source, replacement);
  }
  for (const [source, replacement] of punctuationReplacements) {
    candidate = candidate.replaceAll(source, replacement);
  }
  return candidate.replace(/\r\n?/gu, "\n");
}

function fixMojibake(paths) {
  let changed = 0;
  for (const path of paths) {
    const original = readFileSync(path);
    const text = decodeBestEffort(original);
    const fixed = fixMojibakeText(text);
    if (fixed !== text) {
      writeFileSync(path, fixed, { encoding: "utf8" });
      changed += 1;
    }
  }
  return changed;
}

function runGitDiffCheck() {
  const result = runGit(["diff", "--check"]);
  const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
  return { ok: result.status === 0, output };
}

function printIssues(title, issues) {
  if (issues.length === 0) {
    console.log(`${title}: OK`);
    return;
  }
  console.log(`${title}: ${issues.length} issue(s)`);
  for (const item of issues) {
    const location = item.line == null ? repoRelative(item.path) : `${repoRelative(item.path)}:${item.line}`;
    console.log(`  ${location}: ${item.message}`);
  }
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }

  const paths = args.all ? allRepositoryFiles() : touchedFiles();
  const seamPaths = allRepositoryFiles();
  if (args.verbose) {
    const mode = args.all ? "all repository" : "touched";
    console.log(`Scanning ${paths.length} ${mode} text file(s).`);
    for (const path of paths) console.log(`  ${repoRelative(path)}`);
  }

  if (args.fixMojibake) {
    console.log(`fix-mojibake: updated ${fixMojibake(paths)} file(s).`);
  }
  if (args.fixTrailingWhitespace) {
    console.log(`fix-trailing-whitespace: updated ${fixTrailingWhitespace(paths)} file(s).`);
  }
  if (args.fixLineEndings) {
    console.log(`fix-line-endings: updated ${fixLineEndings(paths)} file(s).`);
  }

  const checks = [
    ["UTF-8", checkUtf8(paths)],
    ["Mojibake", checkMojibake(paths)],
    ["Non-ASCII punctuation", checkNonAsciiPunctuation(paths)],
    ["Decorative HTML entities", checkDecorativeEntities(paths)],
    ["Trailing whitespace", checkTrailingWhitespace(paths)],
    ["Line endings", checkLineEndings(paths)],
    ["Application transport seam", checkApplicationFetch(seamPaths)],
    ["Reader engine import seam", checkEpubTsRuntimeImports(seamPaths)],
    ["Diagnostics seam", checkDirectConsole(seamPaths)],
  ];

  for (const [title, issues] of checks) printIssues(title, issues);

  const diffCheck = runGitDiffCheck();
  if (diffCheck.ok) {
    console.log("git diff --check: OK");
  } else {
    console.log("git diff --check: failed");
    if (diffCheck.output) console.log(diffCheck.output);
  }

  const failed = checks.some(([, issues]) => issues.length > 0) || !diffCheck.ok;
  console.log(`Static hygiene: ${failed ? "FAILED" : "passed"} (${paths.length} file(s) scanned).`);
  return failed ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
