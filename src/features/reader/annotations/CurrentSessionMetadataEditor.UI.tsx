import { useEffect, useMemo, useState } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import { getSessionDisplayName } from "../../sessions/SessionDisplayName.Presenter";
import { SESSION_METADATA_LIMITS } from "../../sessions/SessionMetadata.Policy";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";

export function CurrentSessionMetadataEditor(props: {
  sessionId?: string | null;
  name: string | null;
  notes: string | null;
  busy?: boolean;
  loadStatus?: "idle" | "loading" | "ready" | "error";
  loadError?: string | null;
  readOnly?: boolean;
  onSave: (update: { name: string; notes: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const displayName = useMemo(() => {
    return getSessionDisplayName(props.name, props.sessionId);
  }, [props.name, props.sessionId]);

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
      <div className="spCurrentSessionMeta spCurrentSessionMetaEditing" aria-label="Edit current Reading Session details">
        <div className="spCurrentSessionMetaGrid">
          <div className="spCurrentSessionMetaFieldLabel">Name</div>
          <div className="spCurrentSessionMetaFieldBody">
            <input
              className="input spCurrentSessionMetaName"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value.slice(0, SESSION_METADATA_LIMITS.nameMaxChars))}
              placeholder="Unnamed Session"
              aria-label="Reading Session name"
              maxLength={SESSION_METADATA_LIMITS.nameMaxChars}
              disabled={!canSave}
            />
          </div>

          <div className="spCurrentSessionMetaFieldLabel">Notes</div>
          <div className="spCurrentSessionMetaFieldBody">
            <textarea
              className="input spCurrentSessionMetaNotes"
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value.slice(0, SESSION_METADATA_LIMITS.notesMaxChars))}
              placeholder="Notes..."
              aria-label="Reading Session notes"
              maxLength={SESSION_METADATA_LIMITS.notesMaxChars}
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
                    debugWarn("reader", "Reading Session details were not saved", {
                      sessionId: props.sessionId,
                      error: e,
                    });
                    setSaveStatus("error");
                    setSaveError("Couldn't save the Reading Session details. Try again.");
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
        {!props.readOnly ? (
          <button
            type="button"
            className="button buttonCompact spIconButton spIconButtonTight"
            aria-label="Edit Reading Session details"
            title="Edit"
            disabled={props.busy || props.loadStatus === "loading"}
            onClick={() => setEditing(true)}
          >
            <MaterialIcon name="edit" />
          </button>
        ) : null}
        <div className="spCurrentSessionMetaSummaryLabel">Current Reading Session</div>
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

      {props.loadStatus === "loading" ? <div className="muted spCurrentSessionMetaHint">Loading Reading Session details...</div> : null}
      {props.loadStatus === "error" && props.loadError ? (
        <div className="muted spCurrentSessionMetaHint">{props.loadError}</div>
      ) : null}
    </div>
  );
}
