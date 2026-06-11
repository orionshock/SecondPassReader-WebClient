import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@secondpass/client";
import { navigateTo } from "../../app/navigation";
import type { Shelf } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { createSplClientFromProfile } from "../../app/createSplClient";
import { MaterialIcon } from "../../components/MaterialIcon";
import { ShelfForm, type ShelfFormValues } from "./ShelfForm";
import { canEditShelf, ShelfMetaLine } from "./shelfMeta";

function shelfToFormValues(shelf?: Shelf | null): ShelfFormValues {
  return {
    name: shelf?.name ?? "",
    description: shelf?.description ?? "",
    visibility: shelf?.visibility === "listed" ? "listed" : "private",
  };
}

function shelfOwnerUserId(shelf: Shelf): string | null {
  return shelf.owner_type === "user" && shelf.owner_user?.id !== undefined ? String(shelf.owner_user.id) : null;
}

export function ShelvesPage({ profile }: { profile: ConnectionProfile | null }) {
  const canLoad = Boolean(profile?.apiBaseUrl && profile?.accessToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Shelf[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<ShelfFormValues>(() => shelfToFormValues());
  const [menuShelfId, setMenuShelfId] = useState<string | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      const r = await spl.shelves.list();
      setData(r.results ?? []);
    } catch (e) {
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "Could not load shelves. Your device token may be revoked or not allowed to access shelves."
          : e instanceof Error
            ? e.message
            : "Failed to load shelves.";
      setError(message);
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [profile]);

  useEffect(() => {
    setData(null);
    setError(null);
    setBusy(false);
    setCreateOpen(false);
    setMenuShelfId(null);
    setMutationError(null);
    if (!canLoad) return;
    void load();
  }, [canLoad, load]);

  const currentUserId = profile?.verifiedUser?.id !== undefined ? String(profile.verifiedUser.id) : null;

  const { myShelves, sharedShelves } = useMemo(() => {
    const shelves = data ?? [];
    const myShelves = currentUserId
      ? shelves.filter((s) => shelfOwnerUserId(s) === currentUserId)
      : [];
    const sharedShelves = currentUserId
      ? shelves.filter((s) => shelfOwnerUserId(s) !== currentUserId)
      : shelves;
    return { myShelves, sharedShelves };
  }, [currentUserId, data]);

  const handleCreate = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    const name = createDraft.name.trim();
    if (!name) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.shelves.create({
        name,
        description: createDraft.description.trim(),
        owner_type: "user",
        visibility: createDraft.visibility,
      });
      setCreateOpen(false);
      setCreateDraft(shelfToFormValues());
      setMenuShelfId(null);
      await load();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Failed to create shelf.");
    } finally {
      setMutationBusy(false);
    }
  }, [createDraft, load, profile]);

  const handleDelete = useCallback(async (shelf: Shelf) => {
    if (!profile?.apiBaseUrl || !profile.accessToken || !canEditShelf(shelf)) return;
    if (!window.confirm("Delete this shelf? Books and files will not be deleted.")) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.shelves.remove(shelf.id);
      setMenuShelfId(null);
      await load();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Failed to delete shelf.");
    } finally {
      setMutationBusy(false);
    }
  }, [load, profile]);

  const renderShelf = useCallback((shelf: Shelf) => {
    const canEdit = canEditShelf(shelf);
    const menuOpen = menuShelfId === shelf.id;
    return (
      <div key={shelf.id} className="shelfCard">
        <div className="shelfCardMain">
          <div className="shelfCardTitle">{shelf.name}</div>
          <div className="muted">
            <ShelfMetaLine shelf={shelf} />
          </div>
        </div>
        <div className="shelfCardActions">
          <button
            type="button"
            className="button buttonCompact"
            onClick={() => navigateTo({ kind: "shelf", shelfId: shelf.id })}
          >
            Open
          </button>
          {canEdit ? (
            <div className="shelfOverflow">
              <button
                type="button"
                className="button buttonCompact shelfIconButton"
                onClick={() => setMenuShelfId((current) => (current === shelf.id ? null : shelf.id))}
                disabled={mutationBusy}
                aria-label={`More actions for ${shelf.name}`}
                aria-expanded={menuOpen}
                title="More actions"
              >
                <MaterialIcon name="more_vert" />
              </button>
              {menuOpen ? (
                <div className="shelfOverflowMenu" role="menu">
                  <button
                    type="button"
                    className="shelfOverflowItem"
                    onClick={() => {
                      setMenuShelfId(null);
                      navigateTo({ kind: "shelfEdit", shelfId: shelf.id });
                    }}
                    disabled={mutationBusy}
                    role="menuitem"
                  >
                    <MaterialIcon name="edit" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="shelfOverflowItem shelfOverflowItemDanger"
                    onClick={() => void handleDelete(shelf)}
                    disabled={mutationBusy}
                    role="menuitem"
                  >
                    <MaterialIcon name="delete" />
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }, [handleDelete, menuShelfId, mutationBusy]);

  const formOpen = createOpen;

  return (
    <section className="panel shelvesSection">
      <div className="panelHeaderRow">
        <h2 className="panelTitle">Shelves</h2>
        {canLoad ? (
          <button
            type="button"
            className="button buttonPrimary buttonCompact"
            onClick={() => {
              setCreateOpen(true);
              setCreateDraft(shelfToFormValues());
              setMenuShelfId(null);
              setMutationError(null);
            }}
            disabled={busy || mutationBusy || formOpen}
          >
            Create shelf
          </button>
        ) : null}
      </div>

      {!canLoad ? <p className="muted">Select a verified profile first.</p> : null}
      {busy ? <p className="muted">{`Loading${"\u2026"}`}</p> : null}
      {error ? (
        <div className="errorText">
          {error}{" "}
          <button type="button" className="button buttonCompact" onClick={() => void load()} disabled={!canLoad || busy}>
            Retry
          </button>
        </div>
      ) : null}
      {mutationError ? <div className="errorText">{mutationError}</div> : null}

      {formOpen ? (
        <div
          className="modalOverlay shelfModalOverlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !mutationBusy) {
              setCreateOpen(false);
              setMutationError(null);
            }
          }}
        >
          <section className="modalPanel shelfModalPanel" role="dialog" aria-modal="true" aria-labelledby="shelf-form-title">
            <div className="modalHeaderRow">
              <div className="modalTitle" id="shelf-form-title">
                Create shelf
              </div>
              <button
                type="button"
                className="button buttonCompact shelfIconButton"
                onClick={() => {
                  setCreateOpen(false);
                  setMutationError(null);
                }}
                disabled={mutationBusy}
                aria-label="Close"
                title="Close"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="modalBody">
              <ShelfForm
                values={createDraft}
                onChange={setCreateDraft}
                onSubmit={() => void handleCreate()}
                onCancel={() => {
                  setCreateOpen(false);
                  setMutationError(null);
                }}
                submitLabel="Create shelf"
                busy={mutationBusy}
              />
            </div>
          </section>
        </div>
      ) : null}

      {canLoad && !busy && !error && data && data.length === 0 ? <p className="muted">No shelves yet.</p> : null}

      {data ? (
        <div className="shelfList">
          <div>
            <h3 className="panelTitle" style={{ margin: "6px 0 8px" }}>
              My shelves
            </h3>
            {myShelves.length === 0 ? <div className="muted">No shelves in this section.</div> : null}
            {myShelves.map(renderShelf)}
          </div>

          <div>
            <h3 className="panelTitle" style={{ margin: "6px 0 8px" }}>
              Shared shelves
            </h3>
            {sharedShelves.length === 0 ? <div className="muted">No shelves in this section.</div> : null}
            {sharedShelves.map(renderShelf)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
