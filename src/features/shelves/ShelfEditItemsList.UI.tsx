import type { ShelfItem } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { resolveCoverUrl } from "../library/BookCover.Mapper";

function formatAuthors(item: ShelfItem): string {
  const authors = item.book.authors ?? [];
  return authors.map((a) => a.name).filter(Boolean).join(", ");
}

export function ShelfEditItemsList({
  items,
  profile,
  itemCount,
  positionOptions,
  mutationBusyId,
  onMove,
  onMoveToPosition,
  onRemove,
}: {
  items: ShelfItem[];
  profile: ConnectionProfile | null;
  itemCount: number;
  positionOptions: number[];
  mutationBusyId: string | null;
  onMove: (item: ShelfItem, move: "up" | "down") => void;
  onMoveToPosition: (item: ShelfItem, position: number) => void;
  onRemove: (item: ShelfItem) => void;
}) {
  return (
    <>
      <div className="shelfEditHint">Use the arrows or choose a position to reorder books.</div>
      <div className="shelfBookList">
        {items.map((it, index) => {
          const coverSrc = resolveCoverUrl(it.book.cover_url ?? null, profile);
          const authors = formatAuthors(it);
          const series = it.book.series?.name && it.book.series ? it.book.series.name : null;
          const itemBusy = mutationBusyId === it.id;
          const currentPosition = typeof it.position === "number" ? it.position : index;

          return (
            <div key={it.id} className="shelfBookCard shelfEditBookCard">
              <div className="shelfBookCover">
                {coverSrc ? (
                  <img
                    className="shelfBookCoverImg"
                    src={coverSrc}
                    alt={`${it.book.title} cover`}
                    loading="lazy"
                  />
                ) : (
                  <div className="bookCoverPlaceholderText">No cover</div>
                )}
              </div>

              <div className="shelfBookMain">
                <div className="bookTitle">{it.book.title}</div>
                {authors ? <div className="bookLine">{authors}</div> : null}
                {series ? <div className="bookLine muted">{series}</div> : null}
              </div>

              <div className="shelfEditItemActions">
                <button
                  type="button"
                  className="button buttonCompact shelfIconButton"
                  onClick={() => onMove(it, "up")}
                  disabled={itemBusy || index === 0}
                  aria-label="Move up"
                  title="Move up"
                >
                  <MaterialIcon name="keyboard_arrow_up" />
                </button>
                <button
                  type="button"
                  className="button buttonCompact shelfIconButton"
                  onClick={() => onMove(it, "down")}
                  disabled={itemBusy || index === items.length - 1}
                  aria-label="Move down"
                  title="Move down"
                >
                  <MaterialIcon name="keyboard_arrow_down" />
                </button>
                <label className="shelfMoveSelectLabel">
                  <span className="fieldLabel">Position</span>
                  <select
                    className="input inputCompact shelfMoveSelect"
                    value={String(currentPosition)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isInteger(next) && next >= 0 && next < itemCount && next !== currentPosition) {
                        onMoveToPosition(it, next);
                      }
                    }}
                    disabled={itemBusy || itemCount <= 1}
                  >
                    {positionOptions.map((position) => (
                      <option key={position} value={position}>
                        {position + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button buttonCompact shelfIconButton shelfRemoveIconButton"
                  onClick={() => onRemove(it)}
                  disabled={itemBusy}
                  aria-label="Remove from shelf"
                  title="Remove from shelf"
                >
                  <MaterialIcon name="delete" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
