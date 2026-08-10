import type { Location } from "@likecoin/epub-ts";
import type { ReaderLocation, ReaderLocationTarget, ReaderTocItem } from "../domain/ReaderDomain.Types";

export function toRenditionTarget(target: ReaderLocationTarget | undefined): string | number | undefined {
  if (!target) return undefined;
  switch (target.type) {
    case "cfi":
      return target.cfi;
    case "cfiRange":
      return target.cfiRange;
    case "href":
      return target.href;
  }
}

export function normalizeLocation(loc: Location, opts?: {
  bookProgress?: number | undefined;
  sectionCount?: number | undefined;
  locationCount?: number | undefined;
}): ReaderLocation {
  const start = loc.start;
  return {
    cfi: start.cfi,
    href: start.href,
    bookProgress: typeof opts?.bookProgress === "number" ? opts.bookProgress : typeof start.percentage === "number" ? start.percentage : undefined,
    sectionIndex: typeof start.index === "number" ? start.index : undefined,
    sectionCount: opts?.sectionCount,
    locationIndex: typeof start.location === "number" ? start.location : undefined,
    locationCount: opts?.locationCount,
    displayedPage: start.displayed?.page,
    displayedTotal: start.displayed?.total,
    raw: loc,
  };
}

export function normalizeTocItems(items: Array<{ id: string; href: string; label: string; subitems?: any[] }>): ReaderTocItem[] {
  return items
    .filter((i) => i && typeof i.href === "string" && typeof i.label === "string")
    .map((i) => ({
      id: i.id,
      label: i.label,
      href: i.href,
      children: Array.isArray(i.subitems) ? normalizeTocItems(i.subitems) : undefined,
    }));
}
