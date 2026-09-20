import type { ReactNode } from "react";
import { InlineMeta } from "./Metadata.UI";

type PageSizeControl = {
  value: number;
  options: readonly number[];
  onChange: (value: number) => void;
};

type Props = {
  page: number;
  total: number;
  pageSize: PageSizeControl;
  busy: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  contextControls?: ReactNode;
  previousAriaLabel?: string;
  nextAriaLabel?: string;
  stickyBottom?: boolean;
};

export function CollectionPagination({
  page, total, pageSize, busy, hasPrevious, hasNext, onPrevious, onNext,
  contextControls, previousAriaLabel, nextAriaLabel, stickyBottom = false,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize.value));
  const pageSizeOptions = pageSize.options.includes(pageSize.value)
    ? pageSize.options
    : [pageSize.value, ...pageSize.options];
  return (
    <div className={`collectionPager ${stickyBottom ? "collectionPagerBottom" : ""}`.trim()}>
      <div className="muted collectionPagerStatus">
        <InlineMeta items={[`Page ${page} of ${totalPages}`, String(total)]} />
      </div>
      <div className="collectionPagerRight">
        {contextControls}
        <label className="collectionPagerPageSize">
          <span className="srOnly">Results per page</span>
          <select className="input inputCompact" value={pageSize.value} onChange={(event) => pageSize.onChange(Number(event.target.value))}>
            {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <div className="pagerButtons">
          <button className="button buttonCompact" type="button" onClick={onPrevious} disabled={busy || !hasPrevious} aria-label={previousAriaLabel}>Previous</button>
          <button className="button buttonCompact" type="button" onClick={onNext} disabled={busy || !hasNext} aria-label={nextAriaLabel}>Next</button>
        </div>
      </div>
    </div>
  );
}
