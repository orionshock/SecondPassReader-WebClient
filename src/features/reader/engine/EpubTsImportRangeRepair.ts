import { EpubCFI } from "@likecoin/epub-ts";

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
  if (!doc) return null;

  const normalizedFullText = normalizeImportRepairText(fullText);
  const normalizedFragment = normalizeImportRepairText(fragmentText);
  if (!normalizedFullText || !normalizedFragment || normalizedFullText === normalizedFragment) return null;

  const flat = flattenSectionText(doc);
  if (!flat.text || flat.map.length === 0) return null;

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
  if (fragmentAt < 0) return null;

  const windowStart = Math.max(0, fragmentAt - windowRadius);
  const windowEnd = Math.min(flat.text.length, fragmentAt + normalizedFragment.length + windowRadius);
  const repairedAt = flat.text.slice(windowStart, windowEnd).indexOf(normalizedFullText);
  if (repairedAt < 0) return null;

  const start = windowStart + repairedAt;
  const end = start + normalizedFullText.length;
  const startPoint = flat.map[start];
  const endPoint = flat.map[end - 1];
  if (!startPoint || !endPoint) return null;

  try {
    const range = doc.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.endOffset);
    return { cfiRange: section.cfiFromRange(range), matchedText: normalizedFullText };
  } catch {
    return null;
  }
}

export function normalizeImportRepairText(text: string): string {
  return text.replace(/[\s\u00a0]+/g, " ").trim();
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
  if (anchorOffset == null) return flatText.indexOf(fragmentText);
  if (flatText.slice(anchorOffset, anchorOffset + fragmentText.length) === fragmentText) return anchorOffset;

  const start = Math.max(0, anchorOffset - windowRadius);
  const end = Math.min(flatText.length, anchorOffset + fragmentText.length + windowRadius);
  const found = flatText.slice(start, end).indexOf(fragmentText);
  return found >= 0 ? start + found : -1;
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
  }
  return null;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Import range repair cancelled.", "AbortError");
}
