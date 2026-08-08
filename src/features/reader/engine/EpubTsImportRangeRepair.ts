import { EpubCFI } from "@likecoin/epub-ts";
import { debugReaderImport, isReaderImportDebugVerbose, previewImportText } from "../imports/readerImportDebug";

type RepairableSection = {
  document?: Document;
  cfiFromRange(range: Range): string;
};

type TextSourcePoint = {
  node: Text;
  offset: number;
  endOffset: number;
};

export type ImportedHighlightRangeRepair = {
  cfiRange: string;
  matchedText: string;
};

export function repairImportedHighlightRangeInSection({
  section,
  anchorCfi,
  fragmentText,
  fullText,
  signal,
  windowRadius = 2000,
}: {
  section: RepairableSection;
  anchorCfi: string;
  fragmentText: string;
  fullText: string;
  signal?: AbortSignal;
  windowRadius?: number;
}): ImportedHighlightRangeRepair | null {
  throwIfAborted(signal);
  const doc = section.document;
  if (!doc) {
    debugReaderImport("range repair skipped", {
      reason: "missing document",
      anchorCfi,
      fragmentPreview: previewImportText(fragmentText),
      fullPreview: previewImportText(fullText),
    });
    return null;
  }

  const normalizedFullText = normalizeImportRepairText(fullText);
  const normalizedFragment = normalizeImportRepairText(fragmentText);
  if (!normalizedFullText || !normalizedFragment || normalizedFullText === normalizedFragment) {
    debugReaderImport("range repair skipped", {
      reason: "invalid text",
      anchorCfi,
      fullPreview: previewImportText(normalizedFullText),
      fragmentPreview: previewImportText(normalizedFragment),
    });
    return null;
  }

  const flat = flattenSectionText(doc);
  if (!flat.text || flat.map.length === 0) {
    debugReaderImport("range repair skipped", { reason: "empty flattened section", anchorCfi });
    return null;
  }
  debugReaderImport("range repair start", {
    anchorCfi,
    fragmentPreview: previewImportText(normalizedFragment),
    fullPreview: previewImportText(normalizedFullText),
    flatLength: flat.text.length,
    flatPreview: previewImportText(flat.text.slice(0, 240)),
  });

  // The fragment match is an anchor inside this section. Repair stays same-section
  // because epub-ts CFI generation here is based on one Section document + cfiBase.
  const fragmentAt = findAnchoredFragmentOffset({
    flatText: flat.text,
    map: flat.map,
    doc,
    anchorCfi,
    fragmentText: normalizedFragment,
    windowRadius,
  });
  if (fragmentAt < 0) {
    debugReaderImport("range repair failed", {
      reason: "anchor fragment not found",
      anchorCfi,
      fragmentPreview: previewImportText(normalizedFragment),
      fullPreview: previewImportText(normalizedFullText),
    });
    return null;
  }

  const windowStart = Math.max(0, fragmentAt - windowRadius);
  const windowEnd = Math.min(flat.text.length, fragmentAt + normalizedFragment.length + windowRadius);
  const windowText = flat.text.slice(windowStart, windowEnd);
  const exactAt = windowText.indexOf(normalizedFullText);
  const tolerantRange = exactAt < 0
    ? findPunctuationTolerantRepairRange(windowText, normalizedFullText)
    : null;
  if (exactAt < 0 && !tolerantRange) {
    const verbose = isReaderImportDebugVerbose();
    const anchorContextStart = Math.max(0, fragmentAt - 180);
    const anchorContextEnd = Math.min(flat.text.length, fragmentAt + normalizedFragment.length + 260);
    const anchorContext = flat.text.slice(anchorContextStart, anchorContextEnd);
    debugReaderImport("range repair failed", {
      reason: "full text not found near fragment",
      anchorCfi,
      fragmentAt,
      windowStart,
      windowEnd,
      fragmentPreview: previewImportText(normalizedFragment),
      fullPreview: previewImportText(normalizedFullText),
      anchorContextPreview: verbose ? previewImportText(anchorContext, 500) : undefined,
      punctuationLightFullPreview: verbose
        ? previewImportText(projectPunctuationLightText(normalizedFullText).text, 500)
        : undefined,
      punctuationLightAnchorPreview: verbose
        ? previewImportText(projectPunctuationLightText(anchorContext).text, 500)
        : undefined,
    });
    return null;
  }

  const start = windowStart + (exactAt >= 0 ? exactAt : tolerantRange!.start);
  const end = windowStart + (exactAt >= 0 ? exactAt + normalizedFullText.length : tolerantRange!.end);
  const startPoint = flat.map[start];
  const endPoint = flat.map[end - 1];
  if (!startPoint || !endPoint) {
    debugReaderImport("range repair failed", { reason: "map points missing", start, end });
    return null;
  }

  try {
    const range = doc.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.endOffset);
    const repaired = { cfiRange: section.cfiFromRange(range), matchedText: flat.text.slice(start, end) };
    debugReaderImport("range repair success", {
      anchorCfi,
      fragmentAt,
      start,
      end,
      mode: exactAt >= 0 ? "exact" : "punctuation-tolerant",
      cfiRange: repaired.cfiRange,
      matchedPreview: previewImportText(repaired.matchedText),
    });
    return repaired;
  } catch {
    debugReaderImport("range repair failed", { reason: "cfiFromRange threw", start, end });
    return null;
  }
}

export function normalizeImportRepairText(text: string): string {
  return text.replace(/[\s\u00a0]+/g, " ").trim();
}

export function findPunctuationTolerantRepairRange(
  value: string,
  expected: string,
): { start: number; end: number } | null {
  const projectedValue = projectPunctuationLightText(value);
  const projectedExpected = projectPunctuationLightText(expected).text;
  if (!projectedValue.text || !projectedExpected) return null;
  const at = projectedValue.text.indexOf(projectedExpected);
  if (at < 0) return null;

  let start = projectedValue.offsets[at];
  const lastOffset = projectedValue.offsets[at + projectedExpected.length - 1];
  if (start == null || lastOffset == null) return null;
  const lastChar = String.fromCodePoint(value.codePointAt(lastOffset) ?? 0);
  let end = lastOffset + lastChar.length;
  const trimmedExpected = expected.trim();
  if (/^["'\u2018\u2019\u201c\u201d]/.test(trimmedExpected)) {
    while (start > 0 && /["'\u2018\u2019\u201c\u201d]/.test(value[start - 1] ?? "")) start -= 1;
  }
  if (/[,;:.?!"'\u2018\u2019\u201c\u201d]$/.test(trimmedExpected)) {
    while (end < value.length && /[,;:.?!"'\u2018\u2019\u201c\u201d]/.test(value[end] ?? "")) end += 1;
  }
  return { start, end };
}

function projectPunctuationLightText(value: string): { text: string; offsets: number[] } {
  const chars: string[] = [];
  const offsets: number[] = [];
  const appendSeparator = (offset: number) => {
    if (chars.length === 0 || chars[chars.length - 1] === " ") return;
    chars.push(" ");
    offsets.push(offset);
  };

  for (let offset = 0; offset < value.length;) {
    const char = String.fromCodePoint(value.codePointAt(offset) ?? 0);
    const nextOffset = offset + char.length;
    if (/[\s\u00a0]/.test(char) || /[,;:.?!"\u201c\u201d]/.test(char)) {
      appendSeparator(offset);
    } else if (char === "'" || char === "\u2018" || char === "\u2019") {
      const previous = value[offset - 1];
      const next = value[nextOffset];
      if (!isRepairWordCharacter(previous) || !isRepairWordCharacter(next)) appendSeparator(offset);
    } else {
      for (const projectedChar of char.toLowerCase()) {
        chars.push(projectedChar);
        offsets.push(offset);
      }
    }
    offset = nextOffset;
  }

  while (chars[chars.length - 1] === " ") {
    chars.pop();
    offsets.pop();
  }
  return { text: chars.join(""), offsets };
}

function isRepairWordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{N}]/u.test(value));
}

function flattenSectionText(doc: Document): { text: string; map: TextSourcePoint[] } {
  const root = doc.body ?? doc.documentElement;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let text = "";
  const map: TextSourcePoint[] = [];
  let inWhitespace = false;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const value = textNode.data ?? "";
    for (let offset = 0; offset < value.length;) {
      const char = value[offset] ?? "";
      const endOffset = offset + char.length;
      if (/[\s\u00a0]/.test(char)) {
        if (!inWhitespace) {
          text += " ";
          map.push({ node: textNode, offset, endOffset });
          inWhitespace = true;
        }
      } else {
        text += char;
        map.push({ node: textNode, offset, endOffset });
        inWhitespace = false;
      }
      offset = endOffset;
    }
  }

  return { text, map };
}

function findAnchoredFragmentOffset({
  flatText,
  map,
  doc,
  anchorCfi,
  fragmentText,
  windowRadius,
}: {
  flatText: string;
  map: TextSourcePoint[];
  doc: Document;
  anchorCfi: string;
  fragmentText: string;
  windowRadius: number;
}): number {
  const anchorOffset = findNormalizedOffsetForCfi({ anchorCfi, doc, map });
  if (anchorOffset == null) {
    const fallback = flatText.indexOf(fragmentText);
    debugReaderImport("range repair anchor fallback", {
      anchorCfi,
      fragmentPreview: previewImportText(fragmentText),
      fallback,
    });
    return fallback;
  }
  if (flatText.slice(anchorOffset, anchorOffset + fragmentText.length) === fragmentText) {
    debugReaderImport("range repair anchor direct match", { anchorCfi, anchorOffset });
    return anchorOffset;
  }

  const start = Math.max(0, anchorOffset - windowRadius);
  const end = Math.min(flatText.length, anchorOffset + fragmentText.length + windowRadius);
  const found = flatText.slice(start, end).indexOf(fragmentText);
  const offset = found >= 0 ? start + found : -1;
  debugReaderImport("range repair anchor window search", {
    anchorCfi,
    anchorOffset,
    fragmentPreview: previewImportText(fragmentText),
    windowStart: start,
    windowEnd: end,
    found: offset,
  });
  return offset;
}

function findNormalizedOffsetForCfi({
  anchorCfi,
  doc,
  map,
}: {
  anchorCfi: string;
  doc: Document;
  map: TextSourcePoint[];
}): number | null {
  try {
    const range = new EpubCFI(anchorCfi).toRange(doc);
    const startNode = range?.startContainer;
    const startOffset = range?.startOffset;
    if (!startNode || typeof startOffset !== "number") return null;
    for (let i = 0; i < map.length; i += 1) {
      const point = map[i];
      if (point.node === startNode && point.offset >= startOffset) return i;
    }
  } catch {
    // Fall back to a plain fragment search.
    debugReaderImport("range repair CFI anchor lookup failed", { anchorCfi });
  }
  return null;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Import range repair cancelled.", "AbortError");
}
