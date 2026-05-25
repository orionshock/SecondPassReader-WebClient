import { useCallback, useEffect, useMemo, useState } from "react";
import { SecondPassApiClient, ApiError } from "@secondpass/client";
import { navigateTo } from "../../app/navigation";
import type { Shelf } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";

function shelfOwnerLabel(shelf: Shelf): string {
  if (shelf.owner_type === "group") {
    const name = shelf.owner_group?.name?.trim();
    return name ? `Group: ${name}` : "Group shelf";
  }
  const visibility = (shelf.visibility ?? "").toString();
  if (visibility === "listed") return "Listed";
  return "Private";
}

export function ShelvesPage({ profile }: { profile: ConnectionProfile | null }) {
  const canLoad = Boolean(profile?.apiBaseUrl && profile?.accessToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Shelf[] | null>(null);

  const load = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: profile.serverBaseUrl });
      const r = await api.listShelves({
        apiBaseUrl: profile.apiBaseUrl,
        accessToken: profile.accessToken,
        tokenType: profile.tokenType ?? "Bearer",
      });
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
    if (!canLoad) return;
    void load();
  }, [canLoad, load]);

  const { personal, group } = useMemo(() => {
    const shelves = data ?? [];
    const personal = shelves.filter((s) => s.owner_type === "user");
    const group = shelves.filter((s) => s.owner_type === "group");
    return { personal, group };
  }, [data]);

  return (
    <section className="panel shelvesSection">
      <h2 className="panelTitle">Shelves</h2>

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

      {canLoad && !busy && !error && data && data.length === 0 ? <p className="muted">No shelves yet.</p> : null}

      {data ? (
        <div className="shelfList">
          <div>
            <h3 className="panelTitle" style={{ margin: "6px 0 8px" }}>
              Personal shelves
            </h3>
            {personal.length === 0 ? <div className="muted">No personal shelves.</div> : null}
            {personal.map((s) => (
              <button
                key={s.id}
                type="button"
                className="shelfCard"
                onClick={() => navigateTo({ kind: "shelf", shelfId: s.id })}
              >
                <div className="shelfCardTitle">{s.name}</div>
                {s.description ? <div className="muted">{s.description}</div> : null}
                <div className="muted">
                  {(s.item_count ?? 0).toString()} items {"\u00B7"} {shelfOwnerLabel(s)}
                  {s.can_edit ? ` ${"\u00B7"} can edit` : ""}
                </div>
              </button>
            ))}
          </div>

          <div>
            <h3 className="panelTitle" style={{ margin: "6px 0 8px" }}>
              Group shelves
            </h3>
            {group.length === 0 ? <div className="muted">No group shelves.</div> : null}
            {group.map((s) => (
              <button
                key={s.id}
                type="button"
                className="shelfCard"
                onClick={() => navigateTo({ kind: "shelf", shelfId: s.id })}
              >
                <div className="shelfCardTitle">{s.name}</div>
                {s.description ? <div className="muted">{s.description}</div> : null}
                <div className="muted">
                  {(s.item_count ?? 0).toString()} items {"\u00B7"} {shelfOwnerLabel(s)}
                  {s.can_edit ? ` ${"\u00B7"} can edit` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
