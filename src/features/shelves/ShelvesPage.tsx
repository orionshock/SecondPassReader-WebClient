import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@secondpass/client";
import { navigateTo } from "../../app/navigation";
import type { Shelf } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { createSplClientFromProfile } from "../../app/createSplClient";
import { InlineMeta } from "../../components/MetaSeparator";
import { MaterialIcon } from "../../components/MaterialIcon";
import { ShelfForm, type ShelfFormValues } from "./ShelfForm";

function shelfOwnerLabel(shelf: Shelf): string {
  if (shelf.owner_type === "group") {
    const name = shelf.owner_group?.name?.trim();
    return name ? `Group: ${name}` : "Group shelf";
  }
  const visibility = (shelf.visibility ?? "").toString();
  if (visibility === "listed") return "Listed";
  return "Private";
}

function shelfToFormValues(shelf?: Shelf | null): ShelfFormValues {
  return {
    name: shelf?.name ?? "",
    description: shelf?.description ?? "",
    visibility: shelf?.visibility === "listed" ? "listed" : "private",
  };
}

function canEditPersonalShelf(shelf: Shelf): boolean {
  return shelf.owner_type === "user" && shelf.can_edit === true;
}

export function ShelvesPage({ profile }: { profile: ConnectionProfile | null }) {
  const canLoad = Boolean(profile?.apiBaseUrl && profile?.accessToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Shelf[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<ShelfFormValues>(() => shelfToFormValues());
  const [editingShelfId, setEditingShelfId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ShelfFormValues>(() => shelfToFormValues());
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
    setEditingShelfId(null);
    setMenuShelfId(null);
    setMutationError(null);
    if (!canLoad) return;
    void load();
  }, [canLoad, load]);

  const { personal, group } = useMemo(() => {
    const shelves = data ?? [];
    const personal = shelves.filter((s) => s.owner_type === "user");
    const group = shelves.filter((s) => s.owner_type === "group");
    return { personal, group };
  }, [data]);

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

  const handleUpdate = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken || !editingShelfId) return;
    const name = editDraft.name.trim();
    if (!name) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.shelves.update(editingShelfId, {
        name,
        description: editDraft.description.trim(),
        visibility: editDraft.visibility,
      });
      setEditingShelfId(null);
      setMenuShelfId(null);
      await load();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Failed to update shelf.");
    } finally {
      setMutationBusy(false);
    }
  }, [editDraft, editingShelfId, load, profile]);

  const handleDelete = useCallback(async (shelf: Shelf) => {
    if (!profile?.apiBaseUrl || !profile.accessToken || !canEditPersonalShelf(shelf)) return;
    if (!window.confirm("Delete this shelf? Books and files will not be deleted.")) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.shelves.remove(shelf.id);
      if (editingShelfId === shelf.id) setEditingShelfId(null);
      setMenuShelfId(null);
      await load();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Failed to delete shelf.");
    } finally {
      setMutationBusy(false);
    }
  }, [editingShelfId, load, profile]);

  const renderShelf = useCallback((shelf: Shelf) => {
    const canEdit = canEditPersonalShelf(shelf);
    const menuOpen = menuShelfId === shelf.id;
    return (
      <div key={shelf.id} className="shelfCard">
        <div className="shelfCardMain">
          <div className="shelfCardTitle">{shelf.name}</div>
          <div className="muted">
            <InlineMeta items={[`${(shelf.item_count ?? 0).toString()} items`, shelfOwnerLabel(shelf)]} />
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
                      setEditingShelfId(shelf.id);
                      setEditDraft(shelfToFormValues(shelf));
                      setCreateOpen(false);
                      setMenuShelfId(null);
                      setMutationError(null);
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

  const formOpen = createOpen || editingShelfId !== null;
  const editingShelf = editingShelfId ? (data ?? []).find((s) => s.id === editingShelfId) ?? null : null;

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
              setEditingShelfId(null);
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
              setEditingShelfId(null);
              setMutationError(null);
            }
          }}
        >
          <section className="modalPanel shelfModalPanel" role="dialog" aria-modal="true" aria-labelledby="shelf-form-title">
            <div className="modalHeaderRow">
              <div className="modalTitle" id="shelf-form-title">
                {createOpen ? "Create shelf" : `Edit ${editingShelf?.name ?? "shelf"}`}
              </div>
              <button
                type="button"
                className="button buttonCompact shelfIconButton"
                onClick={() => {
                  setCreateOpen(false);
                  setEditingShelfId(null);
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
                values={createOpen ? createDraft : editDraft}
                onChange={createOpen ? setCreateDraft : setEditDraft}
                onSubmit={() => void (createOpen ? handleCreate() : handleUpdate())}
                onCancel={() => {
                  setCreateOpen(false);
                  setEditingShelfId(null);
                  setMutationError(null);
                }}
                submitLabel={createOpen ? "Create shelf" : "Save shelf"}
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
              Personal shelves
            </h3>
            {personal.length === 0 ? <div className="muted">No personal shelves.</div> : null}
            {personal.map(renderShelf)}
          </div>

          <div>
            <h3 className="panelTitle" style={{ margin: "6px 0 8px" }}>
              Group shelves
            </h3>
            {group.length === 0 ? <div className="muted">No group shelves.</div> : null}
            {group.map(renderShelf)}
          </div>
        </div>
      ) : null}
    </section>
  );
}
