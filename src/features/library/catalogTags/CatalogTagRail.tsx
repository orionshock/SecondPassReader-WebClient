import type { SecondPassClient } from "@secondpass/client";
import { useCatalogTags } from "./useCatalogTags";

type Props = { spl: SecondPassClient; groupId?: string; selectedSlug?: string; onSelect: (slug?: string) => void };
export function CatalogTagRail({ spl, groupId, selectedSlug, onSelect }: Props) {
  const { data, busy, error, previousPage, nextPage } = useCatalogTags(spl, groupId);

  return (
    <nav className="catalogTagRail" aria-label="Catalog tags">
      <h2 className="catalogTagRailTitle">Catalog Tags</h2>
      <button type="button" className={`catalogTagRow catalogTagRowAll ${!selectedSlug ? "catalogTagRowActive" : ""}`} onClick={() => onSelect(undefined)} aria-current={!selectedSlug ? "true" : undefined}>
        <span>All tags</span>
      </button>
      {data?.results.map((tag) => (
        <button key={String(tag.id)} type="button" className={`catalogTagRow ${selectedSlug === tag.slug ? "catalogTagRowActive" : ""}`} onClick={() => onSelect(selectedSlug === tag.slug ? undefined : tag.slug)} aria-pressed={selectedSlug === tag.slug}>
          <span className="catalogTagCount" aria-label={`${tag.book_count} books`}>{tag.book_count}</span><span>{tag.name}</span>
        </button>
      ))}
      {busy && !data ? <div className="catalogTagStatus muted">Loading...</div> : null}
      {error ? <div className="catalogTagStatus errorText">{error}</div> : null}
      {data && (data.previous || data.next) ? (
        <div className="catalogTagPager">
          <button className="button buttonCompact" type="button" disabled={busy || !data.previous} onClick={previousPage}>Previous</button>
          <button className="button buttonCompact" type="button" disabled={busy || !data.next} onClick={nextPage}>Next</button>
        </div>
      ) : null}
    </nav>
  );
}
