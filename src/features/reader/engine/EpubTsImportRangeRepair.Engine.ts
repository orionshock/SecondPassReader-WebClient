// Repairs an imported highlight inside one loaded spine section. Staying section-local keeps
// epub-ts CFI generation anchored to that section's document and cfiBase.
import { EpubCFI } from "@likecoin/epub-ts";
import type {
  ReaderRangeRepairDiagnostic,
  ReaderRangeRepairDiagnosticHandler,
} from "../domain/ReaderRangeRepair.Diagnostics";
import {
  findPunctuationTolerantRepairRange,
  normalizeImportRepairText,
  projectPunctuationLightText,
} from "./EpubImportRangeRepair.Policy";

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
  onDiagnostic,
}: {
  section: RepairableSection;
  anchorCfi: string;
  fragmentText: string;
  fullText: string;
  signal?: AbortSignal;
  windowRadius?: number;
  onDiagnostic?: ReaderRangeRepairDiagnosticHandler;
}): ImportedHighlightRangeRepair | null {
  throwIfAborted(signal);
  const doc = section.document;
  if (!doc) {
    emitDiagnostic(onDiagnostic, {
      event: "range repair skipped",
      data: { reason: "missing document", anchorCfi },
      previews: [
        { key: "fragmentPreview", value: fragmentText },
        { key: "fullPreview", value: fullText },
      ],
    });
    return null;
  }

  const normalizedFullText = normalizeImportRepairText(fullText);
  const normalizedFragment = normalizeImportRepairText(fragmentText);
  if (!normalizedFullText || !normalizedFragment || normalizedFullText === normalizedFragment) {
    emitDiagnostic(onDiagnostic, {
      event: "range repair skipped",
      data: { reason: "invalid text", anchorCfi },
      previews: [
        { key: "fullPreview", value: normalizedFullText },
        { key: "fragmentPreview", value: normalizedFragment },
      ],
    });
    return null;
  }

  const flat = flattenSectionText(doc);
  if (!flat.text || flat.map.length === 0) {
    emitDiagnostic(onDiagnostic, {
      event: "range repair skipped",
      data: { reason: "empty flattened section", anchorCfi },
    });
    return null;
  }
  emitDiagnostic(onDiagnostic, {
    event: "range repair start",
    data: { anchorCfi, flatLength: flat.text.length },
    previews: [
      { key: "fragmentPreview", value: normalizedFragment },
      { key: "fullPreview", value: normalizedFullText },
      { key: "flatPreview", value: flat.text.slice(0, 240) },
    ],
  });

  const fragmentAt = findAnchoredFragmentOffset({
    flatText: flat.text,
    map: flat.map,
    doc,
    anchorCfi,
    fragmentText: normalizedFragment,
    windowRadius,
    onDiagnostic,
  });
  if (fragmentAt < 0) {
    emitDiagnostic(onDiagnostic, {
      event: "range repair failed",
      data: { reason: "anchor fragment not found", anchorCfi },
      previews: [
        { key: "fragmentPreview", value: normalizedFragment },
        { key: "fullPreview", value: normalizedFullText },
      ],
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
    const anchorContextStart = Math.max(0, fragmentAt - 180);
    const anchorContextEnd = Math.min(flat.text.length, fragmentAt + normalizedFragment.length + 260);
    const anchorContext = flat.text.slice(anchorContextStart, anchorContextEnd);
    emitDiagnostic(onDiagnostic, {
      event: "range repair failed",
      data: { reason: "full text not found near fragment", anchorCfi, fragmentAt, windowStart, windowEnd },
      previews: [
        { key: "fragmentPreview", value: normalizedFragment },
        { key: "fullPreview", value: normalizedFullText },
        { key: "anchorContextPreview", value: anchorContext, maxLength: 500, verboseOnly: true },
        {
          key: "punctuationLightFullPreview",
          value: projectPunctuationLightText(normalizedFullText).text,
          maxLength: 500,
          verboseOnly: true,
        },
        {
          key: "punctuationLightAnchorPreview",
          value: projectPunctuationLightText(anchorContext).text,
          maxLength: 500,
          verboseOnly: true,
        },
      ],
    });
    return null;
  }

  const start = windowStart + (exactAt >= 0 ? exactAt : tolerantRange!.start);
  const end = windowStart + (exactAt >= 0 ? exactAt + normalizedFullText.length : tolerantRange!.end);
  const startPoint = flat.map[start];
  const endPoint = flat.map[end - 1];
  if (!startPoint || !endPoint) {
    emitDiagnostic(onDiagnostic, {
      event: "range repair failed",
      data: { reason: "map points missing", start, end },
    });
    return null;
  }

  try {
    const range = doc.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.endOffset);
    const repaired = { cfiRange: section.cfiFromRange(range), matchedText: flat.text.slice(start, end) };
    emitDiagnostic(onDiagnostic, {
      event: "range repair success",
      data: {
        anchorCfi,
        fragmentAt,
        start,
        end,
        mode: exactAt >= 0 ? "exact" : "punctuation-tolerant",
        cfiRange: repaired.cfiRange,
      },
      previews: [{ key: "matchedPreview", value: repaired.matchedText }],
    });
    return repaired;
  } catch {
    emitDiagnostic(onDiagnostic, {
      event: "range repair failed",
      data: { reason: "cfiFromRange threw", start, end },
    });
    return null;
  }
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
  onDiagnostic,
}: {
  flatText: string;
  map: TextSourcePoint[];
  doc: Document;
  anchorCfi: string;
  fragmentText: string;
  windowRadius: number;
  onDiagnostic?: ReaderRangeRepairDiagnosticHandler;
}): number {
  const anchorOffset = findNormalizedOffsetForCfi({ anchorCfi, doc, map, onDiagnostic });
  if (anchorOffset == null) {
    const fallback = flatText.indexOf(fragmentText);
    emitDiagnostic(onDiagnostic, {
      event: "range repair anchor fallback",
      data: { anchorCfi, fallback },
      previews: [{ key: "fragmentPreview", value: fragmentText }],
    });
    return fallback;
  }
  if (flatText.slice(anchorOffset, anchorOffset + fragmentText.length) === fragmentText) {
    emitDiagnostic(onDiagnostic, {
      event: "range repair anchor direct match",
      data: { anchorCfi, anchorOffset },
    });
    return anchorOffset;
  }

  const start = Math.max(0, anchorOffset - windowRadius);
  const end = Math.min(flatText.length, anchorOffset + fragmentText.length + windowRadius);
  const found = flatText.slice(start, end).indexOf(fragmentText);
  const offset = found >= 0 ? start + found : -1;
  emitDiagnostic(onDiagnostic, {
    event: "range repair anchor window search",
    data: { anchorCfi, anchorOffset, windowStart: start, windowEnd: end, found: offset },
    previews: [{ key: "fragmentPreview", value: fragmentText }],
  });
  return offset;
}

function findNormalizedOffsetForCfi({
  anchorCfi,
  doc,
  map,
  onDiagnostic,
}: {
  anchorCfi: string;
  doc: Document;
  map: TextSourcePoint[];
  onDiagnostic?: ReaderRangeRepairDiagnosticHandler;
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
    emitDiagnostic(onDiagnostic, {
      event: "range repair CFI anchor lookup failed",
      data: { anchorCfi },
    });
  }
  return null;
}

function emitDiagnostic(
  onDiagnostic: ReaderRangeRepairDiagnosticHandler | undefined,
  diagnostic: ReaderRangeRepairDiagnostic,
): void {
  try {
    onDiagnostic?.(diagnostic);
  } catch {
    // Diagnostics must not alter repair behavior.
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Import range repair cancelled.", "AbortError");
}
