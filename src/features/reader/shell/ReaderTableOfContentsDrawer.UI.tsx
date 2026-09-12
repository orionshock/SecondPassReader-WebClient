import { useMemo, useRef, useState } from "react";
import type { ReaderTocItem } from "../domain/ReaderDomain.Types";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import {
  filterTocItems,
  findCurrentTocItemKey,
  getTocItemKey,
  type FilteredTocItem,
} from "./ReaderTableOfContents.Presenter";
import { useModalDialogFocus } from "../../../components/ModalDialogFocus.Lifecycle";

function TocTree({
  items,
  depth,
  currentItemKey,
  onPick,
}: {
  items: FilteredTocItem[];
  depth: number;
  currentItemKey: string | null;
  onPick: (item: ReaderTocItem) => void;
}) {
  return (
    <ul className={depth === 0 ? "spTocList spTocListRoot" : "spTocList spTocListNested"}>
      {items.map((item) => {
        const key = getTocItemKey(item);
        const hasChildren = Boolean(item.children && item.children.length > 0);
        const isCurrent = key === currentItemKey;
        return (
          <li key={key} className="spTocItem">
            <button
              type="button"
              className={`spTocItemButton${isCurrent ? " spTocItemButtonCurrent" : ""}`}
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() => onPick(item)}
              title={item.label}
              aria-current={isCurrent ? "location" : undefined}
            >
              {item.label}
            </button>
            {hasChildren ? (
              <TocTree
                items={item.children ?? []}
                depth={depth + 1}
                currentItemKey={currentItemKey}
                onPick={onPick}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TableOfContentsDrawer({
  open,
  toc,
  currentHref,
  onClose,
  onPickItem,
}: {
  open: boolean;
  toc: ReaderTocItem[] | null | undefined;
  currentHref?: string | null;
  onClose: () => void;
  onPickItem: (item: ReaderTocItem) => void;
}) {
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useModalDialogFocus({ active: open, dialogRef: panelRef, initialFocusRef: searchInputRef, onDismiss: onClose });

  const filtered = useMemo(() => {
    if (!toc || toc.length === 0) return [];
    return filterTocItems(toc, query);
  }, [query, toc]);

  const currentItemKey = useMemo(
    () => findCurrentTocItemKey(toc ?? [], currentHref),
    [currentHref, toc],
  );

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
        aria-labelledby="sp-toc-drawer-title"
        tabIndex={-1}
        onPointerDown={(e) => {
          // Prevent click-away handler from firing while keeping default behavior
          // for interactive controls within the drawer (focus, text selection).
          e.stopPropagation();
        }}
      >
        <div className="spTocDrawerHeader">
          <h2 id="sp-toc-drawer-title" className="spTocDrawerTitle">Table of contents</h2>
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
            ref={searchInputRef}
            className="input spTocDrawerSearchInput"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contents"
            aria-label="Search table of contents"
          />
        </div>

        <div className="spTocDrawerBody">
          {!hasToc ? <div className="muted spTocEmpty">No table of contents.</div> : null}
          {hasToc && !hasMatches ? <div className="muted spTocEmpty">No matching sections.</div> : null}
          {hasToc && hasMatches ? (
            <TocTree
              items={filtered}
              depth={0}
              currentItemKey={currentItemKey}
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
