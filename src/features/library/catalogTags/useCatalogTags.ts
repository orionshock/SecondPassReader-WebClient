import { useEffect, useRef, useState } from "react";
import type { LibraryTag, PaginatedResponse, SecondPassClient } from "@secondpass/client";

const TAG_PAGE_SIZE = 50;

export function useCatalogTags(spl: SecondPassClient, groupId?: string) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse<LibraryTag> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    setPage(1);
    setData(null);
  }, [groupId]);

  useEffect(() => {
    const request = ++requestSeq.current;
    setBusy(true);
    setError(null);
    const pending = groupId
      ? spl.library.groups.tags(groupId, { ordering: "name", page, pageSize: TAG_PAGE_SIZE })
      : spl.library.tags.list({ ordering: "name", page, pageSize: TAG_PAGE_SIZE });
    void pending.then((result) => {
      if (request === requestSeq.current) setData(result);
    }).catch((reason: unknown) => {
      if (request !== requestSeq.current) return;
      setData(null);
      setError(reason instanceof Error ? reason.message : "Failed to load catalog tags.");
    }).finally(() => {
      if (request === requestSeq.current) setBusy(false);
    });
  }, [groupId, page, spl]);

  return {
    data,
    busy,
    error,
    previousPage: () => setPage((value) => Math.max(1, value - 1)),
    nextPage: () => setPage((value) => value + 1),
  };
}
