import { useEffect, useMemo, useState } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon";

export function CurrentSessionMetadataEditor(props: {
  name: string | null;
  notes: string | null;
  busy?: boolean;
  loadStatus?: "idle" | "loading" | "ready" | "error";
  loadError?: string | null;
  onSave: (update: { name: string; notes: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const displayName = useMemo(() => {
    const n = typeof props.name === "string" ? props.name.trim() : "";
    return n ? n : "Unnamed Session";
  }, [props.name]);

  const notesPreview = useMemo(() => {
    const n = typeof props.notes === "string" ? props.notes.trim() : "";
    return n ? n : "";
  }, [props.notes]);

  useEffect(() => {
    if (!editing) return;
    setDraftName(typeof props.name === "string" ? props.name : "");
    setDraftNotes(typeof props.notes === "string" ? props.notes : "");
  }, [editing, props.name, props.notes]);

  if (editing) {
    const canSave = saveStatus !== "saving" && !props.busy;
    return (
      <div className="spCurrentSessionMeta spCurrentSessionMetaEditing" aria-label="Edit current session details">
        <div className="spCurrentSessionMetaGrid">
          <div className="spCurrentSessionMetaFieldLabel">Name</div>
          <div className="spCurrentSessionMetaFieldBody">
            <input
              className="input spCurrentSessionMetaName"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Unnamed Session"
              aria-label="Session name"
              disabled={!canSave}
            />
          </div>

          <div className="spCurrentSessionMetaFieldLabel">Notes</div>
          <div className="spCurrentSessionMetaFieldBody">
            <textarea
              className="input spCurrentSessionMetaNotes"
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder="Notes..."
              aria-label="Session notes"
              disabled={!canSave}
            />
          </div>
        </div>

        <div className="spCurrentSessionMetaActionsRow">
          {saveStatus === "error" && saveError ? <div className="muted spCurrentSessionMetaError">{saveError}</div> : <div />}
          <div className="spCurrentSessionMetaActions">
            <button
              type="button"
              className="button buttonCompact spIconButton spIconButtonTight"
              aria-label="Save session details"
              title="Save"
              disabled={!canSave}
              onClick={() => {
                setSaveStatus("saving");
                setSaveError(null);
                void (async () => {
                  try {
                    await props.onSave({ name: draftName, notes: draftNotes });
                    setSaveStatus("idle");
                    setEditing(false);
                  } catch (e) {
                    setSaveStatus("error");
                    setSaveError(e instanceof Error ? e.message : "Failed to save session details.");
                  }
                })();
              }}
            >
              <MaterialIcon name="check" />
            </button>
            <button
              type="button"
              className="button buttonCompact spIconButton spIconButtonTight"
              aria-label="Cancel editing session details"
              title="Cancel"
              disabled={saveStatus === "saving"}
              onClick={() => {
                setEditing(false);
                setSaveStatus("idle");
                setSaveError(null);
              }}
            >
              <MaterialIcon name="close" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="spCurrentSessionMeta">
      <div className="spCurrentSessionMetaSummaryRow">
        <button
          type="button"
          className="button buttonCompact spIconButton spIconButtonTight"
          aria-label="Edit session details"
          title="Edit"
          disabled={props.busy || props.loadStatus === "loading"}
          onClick={() => setEditing(true)}
        >
          <MaterialIcon name="edit" />
        </button>
        <div className="spCurrentSessionMetaSummaryLabel">Current Session:</div>
        <div className="spCurrentSessionMetaSummaryValue" title={displayName}>
          <span className="spCurrentSessionMetaSummaryName">{displayName}</span>
          {notesPreview ? (
            <span className="spCurrentSessionMetaSummaryNotes" title={notesPreview}>
              {" "}
              - {notesPreview}
            </span>
          ) : null}
        </div>
      </div>

      {props.loadStatus === "loading" ? <div className="muted spCurrentSessionMetaHint">Loading session details...</div> : null}
      {props.loadStatus === "error" && props.loadError ? (
        <div className="muted spCurrentSessionMetaHint">Failed to load session details: {props.loadError}</div>
      ) : null}
    </div>
  );
}
