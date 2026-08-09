import { EpubCFI } from "@likecoin/epub-ts";

export function isReaderCfiRange(cfi: string | undefined): boolean {
  const trimmed = cfi?.trim() ?? "";
  if (!trimmed) return false;
  try {
    return new EpubCFI(trimmed).range === true;
  } catch {
    return false;
  }
}
