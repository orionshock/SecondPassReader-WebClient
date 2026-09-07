import type { ReaderTocItem } from "../domain/ReaderDomain.Types";
import { normalizeHrefForCompare } from "../display/ReaderLocation.Presenter";

export type FilteredTocItem = ReaderTocItem & { children?: FilteredTocItem[] };

export function getTocItemKey(item: ReaderTocItem): string {
  return `${item.id ?? ""}|${item.href ?? ""}|${item.label ?? ""}`;
}

export function filterTocItems(items: ReaderTocItem[], query: string): FilteredTocItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items as FilteredTocItem[];

  const visit = (list: ReaderTocItem[]): FilteredTocItem[] => {
    const matches: FilteredTocItem[] = [];
    for (const item of list) {
      const label = typeof item.label === "string" ? item.label : "";
      const selfMatches = label.toLowerCase().includes(normalizedQuery);
      const children = Array.isArray(item.children) ? visit(item.children) : [];
      if (!selfMatches && children.length === 0) continue;
      matches.push({ ...item, children: children.length > 0 ? children : undefined });
    }
    return matches;
  };

  return visit(items);
}

export function findCurrentTocItemKey(items: ReaderTocItem[], currentHref: string | null | undefined): string | null {
  const target = typeof currentHref === "string" ? normalizeHrefForCompare(currentHref) : "";
  const targetWithFragment = normalizeHrefWithFragment(currentHref);
  if (!target) return null;

  type TocMatch = { key: string; score: number; depth: number; hrefLength: number };
  const preferMatch = (current: TocMatch | null, candidate: TocMatch | null): TocMatch | null => {
    if (!candidate) return current;
    if (!current) return candidate;
    if (candidate.score !== current.score) return candidate.score > current.score ? candidate : current;
    if (candidate.depth !== current.depth) return candidate.depth > current.depth ? candidate : current;
    return candidate.hrefLength > current.hrefLength ? candidate : current;
  };

  const visit = (list: ReaderTocItem[], depth: number): TocMatch | null => {
    let best: TocMatch | null = null;
    for (const item of list) {
      const candidate = item.href ? normalizeHrefForCompare(item.href) : "";
      const candidateWithFragment = normalizeHrefWithFragment(item.href);
      const exactWithFragment = candidateWithFragment && candidateWithFragment === targetWithFragment;
      const exact = candidate && candidate === target;
      const compatible = candidate && (
        target.endsWith(`/${candidate}`)
        || candidate.endsWith(`/${target}`)
        || target.startsWith(`${candidate}/`)
      );

      if (exactWithFragment || exact || compatible) {
        best = preferMatch(best, {
          key: getTocItemKey(item),
          score: exactWithFragment ? 3 : exact ? 2 : 1,
          depth,
          hrefLength: candidateWithFragment.length,
        });
      }

      if (item.children?.length) best = preferMatch(best, visit(item.children, depth + 1));
    }
    return best;
  };

  return visit(items, 0)?.key ?? null;
}

function normalizeHrefWithFragment(href: string | null | undefined): string {
  if (typeof href !== "string") return "";
  const normalized = href.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const queryIndex = normalized.indexOf("?");
  const withoutQuery = queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
  try {
    return decodeURIComponent(withoutQuery).toLowerCase();
  } catch {
    return withoutQuery.toLowerCase();
  }
}
