import { useEffect, useRef, useState } from "react";
import type { LibraryTag, PaginatedResponse, SecondPassClient } from "@secondpass/client";

type Props = { spl: SecondPassClient; groupId?: string; selectedSlug?: string; onSelect: (slug?: string) => void };
const TAG_PAGE_SIZE = 50;

export function CatalogTagRail({ spl, groupId, selectedSlug, onSelect }: Props) {
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

  return (
    <aside className="catalogTagRail" aria-label="Catalog Tags">
      <h2 className="catalogTagRailTitle">Catalog Tags</h2>
      <button type="button" className={`catalogTagRow catalogTagRowAll ${!selectedSlug ? "catalogTagRowActive" : ""}`} onClick={() => onSelect(undefined)}>
        <span>All tags</span>
      </button>
      {data?.results.map((tag) => (
        <button key={String(tag.id)} type="button" className={`catalogTagRow ${selectedSlug === tag.slug ? "catalogTagRowActive" : ""}`} onClick={() => onSelect(selectedSlug === tag.slug ? undefined : tag.slug)} aria-pressed={selectedSlug === tag.slug}>
          <span className="catalogTagCount">{tag.book_count}</span><span>{tag.name}</span>
        </button>
      ))}
      {busy && !data ? <div className="catalogTagStatus muted">Loading...</div> : null}
      {error ? <div className="catalogTagStatus errorText">{error}</div> : null}
      {data && (data.previous || data.next) ? (
        <div className="catalogTagPager">
          <button className="button buttonCompact" type="button" disabled={busy || !data.previous} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
          <button className="button buttonCompact" type="button" disabled={busy || !data.next} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      ) : null}
    </aside>
  );
}
