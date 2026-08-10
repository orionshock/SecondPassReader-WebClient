import { useEffect, useMemo, useRef, useState } from "react";
import type { ReaderTocItem } from "../domain/ReaderDomain.Types";
import { MaterialIcon } from "../../../components/Material.Icon";

type FilteredTocItem = ReaderTocItem & { children?: FilteredTocItem[] };

function filterToc(items: ReaderTocItem[], query: string): FilteredTocItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items as FilteredTocItem[];

  const visit = (list: ReaderTocItem[]): FilteredTocItem[] => {
    const out: FilteredTocItem[] = [];
    for (const item of list) {
      const label = typeof item.label === "string" ? item.label : "";
      const selfMatch = label.toLowerCase().includes(q);
      const children = Array.isArray(item.children) ? visit(item.children) : [];
      if (!selfMatch && children.length === 0) continue;
      out.push({ ...item, children: children.length > 0 ? children : undefined });
    }
    return out;
  };

  return visit(items);
}

function TocTree({
  items,
  depth,
  onPick,
}: {
  items: FilteredTocItem[];
  depth: number;
  onPick: (item: ReaderTocItem) => void;
}) {
  return (
    <ul
      className={depth === 0 ? "spTocList spTocListRoot" : "spTocList spTocListNested"}
      role={depth === 0 ? "tree" : "group"}
      aria-label={depth === 0 ? "Table of contents" : undefined}
    >
      {items.map((item) => {
        const key = `${item.id ?? ""}|${item.href ?? ""}|${item.label ?? ""}`;
        const hasChildren = Boolean(item.children && item.children.length > 0);
        return (
          <li key={key} className="spTocItem" role="treeitem" aria-expanded={hasChildren ? true : undefined}>
            <button
              type="button"
              className="spTocItemButton"
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() => onPick(item)}
              title={item.label}
            >
              {item.label}
            </button>
            {hasChildren ? <TocTree items={item.children ?? []} depth={depth + 1} onPick={onPick} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TableOfContentsDrawer({
  open,
  toc,
  onClose,
  onPickItem,
}: {
  open: boolean;
  toc: ReaderTocItem[] | null | undefined;
  onClose: () => void;
  onPickItem: (item: ReaderTocItem) => void;
}) {
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const filtered = useMemo(() => {
    if (!toc || toc.length === 0) return [];
    return filterToc(toc, query);
  }, [query, toc]);

  if (!open) return null;

  const hasToc = Boolean(toc && toc.length > 0);
  const hasMatches = filtered.length > 0;

  return (
    <div
      className="spTocDrawerBackdrop"
      role="presentation"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
        onClose();
      }}
    >
      <div
        ref={panelRef}
        className="spTocDrawer"
        role="dialog"
        aria-modal="true"
        aria-label="Table of Contents"
        onPointerDown={(e) => {
          // Prevent click-away handler from firing while keeping default behavior
          // for interactive controls within the drawer (focus, text selection).
          e.stopPropagation();
        }}
      >
        <div className="spTocDrawerHeader">
          <div className="spTocDrawerTitle">Table of Contents</div>
          <button
            type="button"
            className="button buttonCompact spTocDrawerCloseButton"
            onClick={onClose}
            aria-label="Close table of contents"
            title="Close"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="spTocDrawerSearch">
          <input
            className="input spTocDrawerSearchInput"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            aria-label="Search table of contents"
          />
        </div>

        <div className="spTocDrawerBody">
          {!hasToc ? <div className="muted spTocEmpty">No contents available.</div> : null}
          {hasToc && !hasMatches ? <div className="muted spTocEmpty">No matching sections.</div> : null}
          {hasToc && hasMatches ? (
            <TocTree
              items={filtered}
              depth={0}
              onPick={(item) => {
                onPickItem(item);
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
