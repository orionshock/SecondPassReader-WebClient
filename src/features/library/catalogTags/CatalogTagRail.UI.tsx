import type { CatalogResultPage, SecondPassClient } from "@secondpass/client";
import { useCatalogTags } from "./CatalogTags.Controller";
import { getAuthRecoveryMessage, getPageLoadErrorMessage } from "../../../app/AppUserFacingErrors.Mapper";
import { PageLoadErrorNotice } from "../../../app/AppPageLoadErrorNotice.UI";

type Props = {
  spl: SecondPassClient;
  groupId?: string;
  catalogResult?: Pick<CatalogResultPage<unknown>, "catalogTags"> | null;
  selectedSlug?: string;
  onSelect: (slug?: string) => void;
};

export function CatalogTagLoadErrorNotice({ error }: { error: unknown }) {
  return (
    <PageLoadErrorNotice
      error={error}
      message={getPageLoadErrorMessage(
        error,
        "Could not load catalog tags.",
        getAuthRecoveryMessage("load catalog tags"),
      )}
      className="catalogTagStatus errorText"
    />
  );
}

export function CatalogTagRail({ spl, groupId, catalogResult, selectedSlug, onSelect }: Props) {
  const useScopeTotals = catalogResult === undefined
    || (catalogResult !== null && catalogResult.catalogTags === undefined);
  const { data, busy, error, previousPage, nextPage } = useCatalogTags(spl, groupId, useScopeTotals);
  const tags = catalogResult?.catalogTags ?? (useScopeTotals ? data?.results : undefined);

  return (
    <nav className="catalogTagRail" aria-label="Catalog tags">
      <h2 className="catalogTagRailTitle">Catalog Tags</h2>
      <button type="button" className={`catalogTagRow catalogTagRowAll ${!selectedSlug ? "catalogTagRowActive" : ""}`} onClick={() => onSelect(undefined)} aria-current={!selectedSlug ? "true" : undefined}>
        <span>All tags</span>
      </button>
      {tags?.map((tag) => (
        <button key={String(tag.id)} type="button" className={`catalogTagRow ${selectedSlug === tag.slug ? "catalogTagRowActive" : ""}`} onClick={() => onSelect(selectedSlug === tag.slug ? undefined : tag.slug)} aria-pressed={selectedSlug === tag.slug}>
          <span className="catalogTagCount" aria-label={`${tag.bookCount} books`}>{tag.bookCount}</span><span>{tag.name}</span>
        </button>
      ))}
      {useScopeTotals && busy && !data ? <div className="catalogTagStatus muted">Loading...</div> : null}
      {useScopeTotals && error ? <CatalogTagLoadErrorNotice error={error} /> : null}
      {useScopeTotals && data && (data.previous || data.next) ? (
        <div className="catalogTagPager">
          <button className="button buttonCompact" type="button" disabled={busy || !data.previous} onClick={previousPage}>Previous</button>
          <button className="button buttonCompact" type="button" disabled={busy || !data.next} onClick={nextPage}>Next</button>
        </div>
      ) : null}
    </nav>
  );
}
