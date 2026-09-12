import { useEffect, useState } from "react";
import type { LibraryGroup, SecondPassClient } from "@secondpass/client";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";

const GROUP_PAGE_SIZE = 100;

export function useLibraryScopeOptions(spl: SecondPassClient) {
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
        if (!cancelled) {
          debugWarn("reader", "Library Groups could not be loaded", { error: reason });
          setError("Couldn't load Library Groups. Reload the page to try again.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spl]);

  return { groups, busy, error };
}
