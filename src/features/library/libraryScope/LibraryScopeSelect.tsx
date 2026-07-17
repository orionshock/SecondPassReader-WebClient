import { useEffect, useRef, useState } from "react";
import type { LibraryGroup, SecondPassClient } from "@secondpass/client";
import { MaterialIcon } from "../../../components/MaterialIcon";

type Props = { spl: SecondPassClient; groupId?: string; onChange: (groupId?: string) => void };
const GROUP_PAGE_SIZE = 100;

export function LibraryScopeSelect({ spl, groupId, onChange }: Props) {
  const [groups, setGroups] = useState<LibraryGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const loaded: LibraryGroup[] = [];
        let page = 1;
        let hasNext = true;
        while (hasNext) {
          const result = await spl.library.groups.list({ ordering: "name", page, pageSize: GROUP_PAGE_SIZE });
          loaded.push(...result.results);
          hasNext = Boolean(result.next);
          page += 1;
        }
        if (!cancelled) setGroups(loaded);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Failed to load library groups.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [spl]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) detailsRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  const selectedGroup = groups.find((group) => String(group.id) === groupId);
  const selectedName = selectedGroup?.name ?? (groupId ? "Selected Library Group" : "All Library");
  const selectedIcon = selectedGroup?.is_public_group === true ? "public" : groupId ? "groups" : "library_books";
  const select = (nextGroupId?: string) => {
    if (detailsRef.current) detailsRef.current.open = false;
    onChange(nextGroupId);
  };

  return (
    <details className="libraryScopeControl" ref={detailsRef}>
      <summary className="libraryScopeTrigger" aria-label="Library scope" title="Library scope">
        <MaterialIcon name={selectedIcon} className={selectedGroup?.is_public_group === true ? "libraryScopePublicIcon" : undefined} />
        <span>{selectedName}</span>
        <MaterialIcon name="expand_more" className="libraryScopeChevron" />
      </summary>
      <div className="libraryScopeMenu" role="menu" aria-label="Library scope">
        <button type="button" role="menuitemradio" aria-checked={!groupId} className="libraryScopeOption" onClick={() => select(undefined)}>
          <MaterialIcon name="library_books" /><span>All Library</span>
        </button>
        {groups.map((group) => {
          const isPublic = group.is_public_group === true;
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
