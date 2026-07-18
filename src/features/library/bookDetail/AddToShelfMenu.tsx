import { useCallback, useEffect, useRef, useState } from "react";
import type { Shelf, SecondPassClient } from "@secondpass/client";
import { MaterialIcon } from "../../../components/MaterialIcon";
import { getPersonalShelfTargets, type PersonalShelfTarget } from "./addToShelfTargets";

const SHELF_PAGE_SIZE = 100;

async function loadPersonalShelves(spl: SecondPassClient, book?: string): Promise<Shelf[]> {
  const shelves: Shelf[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const result = await spl.shelves.list({ scope: "personal", book, ordering: "name", page, pageSize: SHELF_PAGE_SIZE });
    shelves.push(...result.results);
    hasNext = Boolean(result.next);
    page += 1;
  }
  return shelves;
}

type Props = {
  spl: SecondPassClient;
  bookId: string;
  onManageShelves: () => void;
};

export function AddToShelfMenu({ spl, bookId, onManageShelves }: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const requestSeq = useRef(0);
  const [targets, setTargets] = useState<PersonalShelfTarget[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingShelfId, setAddingShelfId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      await spl.shelves.addItem(shelfId, { book: bookId });
      setTargets((current) => current?.map((target) => String(target.id) === shelfId ? { ...target, added: true } : target) ?? null);
    } catch (reason) {
      try {
        const matchingShelves = await loadPersonalShelves(spl, bookId);
        if (matchingShelves.some((shelf) => String(shelf.id) === shelfId)) {
          setTargets((current) => current?.map((target) => String(target.id) === shelfId ? { ...target, added: true } : target) ?? null);
          return;
        }
      } catch {
        // Preserve the original add error when membership reconciliation also fails.
      }
      setError(reason instanceof Error ? reason.message : "Could not add this book to the shelf.");
    } finally {
      setAddingShelfId(null);
    }
  };

  return (
    <details
      className="bookDetailShelfMenu"
      ref={detailsRef}
      onToggle={(event) => {
        if (event.currentTarget.open && targets === null && !busy) void load();
      }}
    >
      <summary className="button bookDetailShelfTrigger">Add to shelf</summary>
      <div className="bookDetailShelfPopover">
        <div className="bookDetailShelfTitle">Add to personal shelf</div>
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
        <button type="button" className="bookDetailManageShelves" onClick={onManageShelves}>Manage shelves</button>
      </div>
    </details>
  );
}
