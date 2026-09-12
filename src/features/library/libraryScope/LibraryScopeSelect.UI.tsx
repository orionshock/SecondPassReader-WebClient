import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { LibraryGroup } from "@secondpass/client";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";

type Props = {
  groups: LibraryGroup[];
  busy: boolean;
  error: string | null;
  groupId?: string;
  onChange: (groupId?: string) => void;
};

export function LibraryScopeSelect({ groups, busy, error, groupId, onChange }: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) detailsRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  const selectedGroup = groups.find((group) => String(group.id) === groupId);
  const selectedName = selectedGroup?.name ?? (groupId ? "Selected Library Group" : "All Library");
  const selectedIcon = selectedGroup?.isPublicGroup === true ? "public" : groupId ? "groups" : "library_books";
  const select = (nextGroupId?: string) => {
    if (detailsRef.current) detailsRef.current.open = false;
    triggerRef.current?.focus();
    onChange(nextGroupId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape" || !detailsRef.current?.open) return;
    event.preventDefault();
    event.stopPropagation();
    detailsRef.current.open = false;
    triggerRef.current?.focus();
  };

  return (
    <details className="libraryScopeControl" ref={detailsRef} onKeyDown={handleKeyDown} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary ref={triggerRef} className="libraryScopeTrigger" aria-label={`Library scope: ${selectedName}`} aria-expanded={open} title="Library scope">
        <MaterialIcon name={selectedIcon} className={selectedGroup?.isPublicGroup === true ? "libraryScopePublicIcon" : undefined} />
        <span>{selectedName}</span>
        <MaterialIcon name="expand_more" className="libraryScopeChevron" />
      </summary>
      <div className="libraryScopeMenu" role="group" aria-label="Library scope">
        <button type="button" role="menuitemradio" aria-checked={!groupId} className="libraryScopeOption" onClick={() => select(undefined)}>
          <MaterialIcon name="library_books" /><span>All Library</span>
        </button>
        {groups.map((group) => {
          const isPublic = group.isPublicGroup === true;
          return (
            <button key={String(group.id)} type="button" role="menuitemradio" aria-checked={String(group.id) === groupId} className="libraryScopeOption" onClick={() => select(String(group.id))}>
              <MaterialIcon name={isPublic ? "public" : "groups"} className={isPublic ? "libraryScopePublicIcon" : undefined} />
              <span>{group.name}</span>
            </button>
          );
        })}
        {busy ? <div className="libraryScopeStatus muted">Loading...</div> : null}
        {error ? <div className="libraryScopeStatus errorText">{error}</div> : null}
      </div>
    </details>
  );
}
