import type { ReactNode } from "react";
import { InlineMeta } from "../../../components/Metadata.UI";

type Props = {
  metaItems: Array<ReactNode | null | undefined | false>;
  busy: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  stickyBottom?: boolean;
};

export function LibraryPaginationControls({ metaItems, busy, hasPrevious, hasNext, onPrevious, onNext, stickyBottom = false }: Props) {
  return (
    <div className={`libraryMetaRow ${stickyBottom ? "libraryMetaRowBottom" : ""}`.trim()}>
      <div className="muted"><InlineMeta items={metaItems} /></div>
      <div className="pagerButtons">
        <button className="button buttonCompact" type="button" onClick={onPrevious} disabled={busy || !hasPrevious}>Previous</button>
        <button className="button buttonCompact" type="button" onClick={onNext} disabled={busy || !hasNext}>Next</button>
      </div>
    </div>
  );
}
