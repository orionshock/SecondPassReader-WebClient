import type { ReactNode } from "react";
import { InlineMeta } from "../../../components/Metadata.UI";

type Props = {
  metaItems: Array<ReactNode | null | undefined | false>;
  busy: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  previousAriaLabel?: string;
  nextAriaLabel?: string;
  stickyBottom?: boolean;
};

export function LibraryPaginationControls({ metaItems, busy, hasPrevious, hasNext, onPrevious, onNext, previousAriaLabel, nextAriaLabel, stickyBottom = false }: Props) {
  return (
    <div className={`libraryMetaRow ${stickyBottom ? "libraryMetaRowBottom" : ""}`.trim()}>
      <div className="muted"><InlineMeta items={metaItems} /></div>
      <div className="pagerButtons">
        <button className="button buttonCompact" type="button" onClick={onPrevious} disabled={busy || !hasPrevious} aria-label={previousAriaLabel}>Previous</button>
        <button className="button buttonCompact" type="button" onClick={onNext} disabled={busy || !hasNext} aria-label={nextAriaLabel}>Next</button>
      </div>
    </div>
  );
}
