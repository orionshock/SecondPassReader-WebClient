import { EpubCFI } from "@likecoin/epub-ts";
import { assertDurableReaderCfi } from "../domain/DurableReaderCfi.Policy";

function hasComparableSteps(component: EpubCFI["path"]): boolean {
  if (!Array.isArray(component?.steps)) return false;
  if (!component.steps.every((step) => step && Number.isInteger(step.index) && step.index >= 0)) return false;
  const offset = component.terminal?.offset;
  return offset === null || (Number.isInteger(offset) && offset >= 0);
}

function parseComparableCfi(value: string): EpubCFI | null {
  try {
    assertDurableReaderCfi(value);
    const cfi = new EpubCFI(value);
    if (!Number.isInteger(cfi.spinePos) || cfi.spinePos < 0) return null;
    if (!hasComparableSteps(cfi.base) || !hasComparableSteps(cfi.path)) return null;
    if (cfi.range && (!cfi.start || !cfi.end || !hasComparableSteps(cfi.start) || !hasComparableSteps(cfi.end))) return null;
    return cfi;
  } catch {
    return null;
  }
}

export function isComparableEpubCfi(value: string): boolean {
  return parseComparableCfi(value.trim()) !== null;
}

export function compareEpubCfiReadingOrder(left: string, right: string): number | null {
  const leftCfi = parseComparableCfi(left.trim());
  const rightCfi = parseComparableCfi(right.trim());
  if (!leftCfi || !rightCfi) return null;
  try {
    return leftCfi.compare(leftCfi, rightCfi);
  } catch {
    return null;
  }
}
