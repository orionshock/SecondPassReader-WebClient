import { useEffect, useState } from "react";
import type { LibraryGroup, SecondPassClient } from "@secondpass/client";

type Props = {
  spl: SecondPassClient;
  groupId?: string;
  onChange: (groupId?: string) => void;
};

const GROUP_PAGE_SIZE = 100;

export function LibraryScopeSelect({ spl, groupId, onChange }: Props) {
  const [groups, setGroups] = useState<LibraryGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    return () => {
      cancelled = true;
    };
  }, [spl]);

  const selectedGroupIsMissing = Boolean(groupId && !groups.some((group) => String(group.id) === groupId));

  return (
    <label className="libraryScopeControl">
      <span className="libraryScopeLabel">Scope</span>
      <select className="input inputCompact" value={groupId ?? ""} onChange={(event) => onChange(event.target.value || undefined)} disabled={busy && groups.length === 0}>
        <option value="">All Library</option>
        {selectedGroupIsMissing ? <option value={groupId}>Selected Library Group</option> : null}
        {groups.map((group) => <option key={String(group.id)} value={String(group.id)}>{group.name}</option>)}
      </select>
      {error ? <span className="srOnly">{error}</span> : null}
    </label>
  );
}
