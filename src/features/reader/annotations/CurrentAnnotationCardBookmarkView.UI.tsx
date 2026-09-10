import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import { InlineMeta } from "../../../components/Metadata.UI";
import { BOOKMARK_DISPLAY } from "../display/ReaderAnnotation.Presenter";
import type { ReaderBookmarkViewModel } from "./ReaderBookmark.Mapper";

export function CurrentAnnotationCardBookmarkView({
  bookmark,
  isCurrent,
  locationMetaParts,
  when,
  readOnly,
  onDelete,
  onJump,
}: {
  bookmark: ReaderBookmarkViewModel;
  isCurrent: boolean;
  locationMetaParts: string[];
  when: string | null;
  readOnly: boolean;
  onDelete: () => void;
  onJump: () => void;
}) {
  return (
    <article
      key={bookmark.id}
      tabIndex={-1}
      data-annotation-id={bookmark.id}
      className={`spAnnotationCard spAnnotationCardBookmark ${isCurrent ? "spAnnotationCardCurrent" : ""}`}
    >
      <div className="spAnnotationLeftRail" aria-hidden="true">
        <span className="spAnnotationTypeIcon" title={BOOKMARK_DISPLAY.label}>
          <MaterialIcon name={BOOKMARK_DISPLAY.iconName} />
        </span>
      </div>

      <div className="spAnnotationBody">
        <div className="spAnnotationBookmarkRow" title={bookmark.label}>
          <span className="spAnnotationBookmarkText">
            Bookmark
            {bookmark.descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
          </span>
          {isCurrent ? <span className="spAnnotationBadge">Current</span> : null}
        </div>
        {locationMetaParts.length > 0 || when ? (
          <div className="muted spAnnotationActionMeta" title={bookmark.label}>
            <InlineMeta items={[...locationMetaParts, when]} />
          </div>
        ) : null}
      </div>

      <div className="spAnnotationRightRail" aria-label="Bookmark actions">
        <button
          type="button"
          className="button buttonCompact spIconButton"
          onClick={onJump}
          aria-label="Jump to bookmark"
          title="Jump to location"
        >
          <MaterialIcon name="my_location" />
        </button>
        {!readOnly ? (
          <button
            type="button"
            className="button buttonDanger buttonCompact spIconButton"
            onClick={onDelete}
            aria-label="Delete bookmark"
            title="Delete bookmark"
          >
            <MaterialIcon name="delete" />
          </button>
        ) : null}
      </div>
    </article>
  );
}
