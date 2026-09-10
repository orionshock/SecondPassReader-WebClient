import { useCallback, useEffect, useRef, useState } from "react";
import type { SecondPassClient } from "@secondpass/client";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import { getPersonalShelfTargets, type PersonalShelfTarget } from "./AddToShelfTargets.Mapper";
import { addBookToPersonalShelf, loadPersonalShelves } from "./PersonalShelf.Actions";

type Props = {
  spl: SecondPassClient;
  bookId: string;
  onManageShelves: () => void;
};

export function AddToShelfMenu({ spl, bookId, onManageShelves }: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const requestSeq = useRef(0);
  const [targets, setTargets] = useState<PersonalShelfTarget[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingShelfId, setAddingShelfId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setBusy(true);
    setError(null);
    try {
      const [personalShelves, matchingShelves] = await Promise.all([
        loadPersonalShelves(spl),
        loadPersonalShelves(spl, bookId),
      ]);
      if (seq !== requestSeq.current) return;
      const addedIds = new Set(matchingShelves.map((shelf) => String(shelf.id)));
      setTargets(getPersonalShelfTargets(personalShelves, addedIds));
    } catch (reason) {
      if (seq !== requestSeq.current) return;
      setTargets(null);
      setError(reason instanceof Error ? reason.message : "Failed to load personal shelves.");
    } finally {
      if (seq === requestSeq.current) setBusy(false);
    }
  }, [bookId, spl]);

  useEffect(() => {
    setTargets(null);
    setError(null);
    requestSeq.current += 1;
  }, [bookId, spl]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) detailsRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  const addToShelf = async (shelfId: string) => {
    setAddingShelfId(shelfId);
    setError(null);
    try {
      const result = await addBookToPersonalShelf({ spl, shelfId, bookId });
      if (result.added) {
        setTargets((current) => current?.map((target) => String(target.id) === shelfId ? { ...target, added: true } : target) ?? null);
      } else {
        setError(result.message);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add this book to the shelf.");
    } finally {
      setAddingShelfId(null);
    }
  };

  const closeAndRestoreFocus = () => {
    if (detailsRef.current) detailsRef.current.open = false;
    triggerRef.current?.focus();
  };

  return (
    <details
      className="bookDetailShelfMenu"
      ref={detailsRef}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.preventDefault();
        event.stopPropagation();
        closeAndRestoreFocus();
      }}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (event.currentTarget.open && targets === null && !busy) void load();
      }}
    >
      <summary ref={triggerRef} className="button bookDetailShelfTrigger" aria-haspopup="menu" aria-expanded={open}>Add to shelf</summary>
      <div className="bookDetailShelfPopover" role="menu" aria-label="Add to personal shelf">
        <div className="bookDetailShelfTitle" aria-hidden="true">Add to personal shelf</div>
        {busy && targets === null ? <div className="bookDetailShelfStatus muted">Loading...</div> : null}
        {targets?.length ? (
          <div className="bookDetailShelfRows">
            {targets.map((shelf) => {
              const shelfId = String(shelf.id);
              const adding = addingShelfId === shelfId;
              return (
                <button
                  key={shelfId}
                  type="button"
                  role="menuitem"
                  className="bookDetailShelfRow"
                  disabled={shelf.added || adding}
                  onClick={() => void addToShelf(shelfId)}
                >
                  <span>{shelf.name}</span>
                  <span className="bookDetailShelfRowState">
                    {shelf.added ? <><MaterialIcon name="check" />Added</> : adding ? "Adding..." : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {!busy && targets?.length === 0 ? <div className="bookDetailShelfStatus muted">No personal shelves available.</div> : null}
        {error ? <div className="bookDetailShelfStatus errorText">{error}</div> : null}
        <button type="button" role="menuitem" className="bookDetailManageShelves" onClick={onManageShelves}>Manage shelves</button>
      </div>
    </details>
  );
}
