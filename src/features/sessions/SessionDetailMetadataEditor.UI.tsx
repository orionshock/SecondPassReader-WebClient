import type { MarginaliaSession } from "@secondpass/client";
import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { SESSION_METADATA_LIMITS } from "./SessionMetadata.Policy";

export function SessionDetailMetadataEditor({
  session,
  isActive,
  draftNotes,
  setDraftNotes,
  editingNotes,
  setEditingNotes,
  saveBusy,
  saveError,
  clearSaveError,
  onSaveNotes,
}: {
  session: MarginaliaSession;
  isActive: boolean;
  draftNotes: string;
  setDraftNotes: (value: string) => void;
  editingNotes: boolean;
  setEditingNotes: (value: boolean) => void;
  saveBusy: boolean;
  saveError: string | null;
  clearSaveError: () => void;
  onSaveNotes: () => void;
}) {
  const noteText = session.notes.trim();

  if (!isActive) {
    return (
      <div className="sessionReadOnly">
        <div className="sessionClosedNotice muted">
          This Reading Session is closed. Its name, notes, and annotations are read-only.
        </div>
        <div className="sessionNoteDisplay">
          <div className={`sessionNoteHeading${noteText ? "" : " muted"}`}>
            {noteText ? "Reading Session note" : "No Reading Session note"}
          </div>
          {noteText ? <div className="sessionNoteText">{session.notes}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="sessionEdit">
      {!editingNotes ? (
        <div className="sessionNoteDisplay">
          <div className="sessionNoteHeadingRow">
            <div className={`sessionNoteHeading${noteText ? "" : " muted"}`}>
              {noteText ? "Reading Session note" : "No Reading Session note"}
            </div>
            <button
              type="button"
              className="button buttonCompact sessionInlineEditButton"
              onClick={() => {
                setDraftNotes(typeof session.notes === "string" ? session.notes : "");
                setEditingNotes(true);
              }}
              aria-label="Edit Reading Session notes"
              title="Edit"
            >
              <MaterialIcon name="edit" />
            </button>
          </div>
          {noteText ? <div className="sessionNoteText">{session.notes}</div> : null}
        </div>
      ) : (
        <div className="sessionNoteEditBody">
          <div className="sessionNoteHeading">Reading Session note</div>
          <div className="sessionInlineEditNotesWrap">
            <textarea
              className="input sessionInlineEditTextarea"
              cols={40}
              rows={8}
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value.slice(0, SESSION_METADATA_LIMITS.notesMaxChars))}
              aria-label="Reading Session note"
              maxLength={SESSION_METADATA_LIMITS.notesMaxChars}
            />
          </div>
          <div className="sessionNoteEditFooter">
            <div className="sessionInlineEditNotesFooter muted">{draftNotes.length}/{SESSION_METADATA_LIMITS.notesMaxChars}</div>
            <div className="sessionNoteEditActions">
              <button
                type="button"
                className="button buttonCompact"
                onClick={() => {
                  setEditingNotes(false);
                  setDraftNotes(typeof session.notes === "string" ? session.notes : "");
                  clearSaveError();
                }}
                disabled={saveBusy}
              >
                Cancel
              </button>
              <button type="button" className="button buttonPrimary buttonCompact" onClick={onSaveNotes} disabled={saveBusy}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingNotes && saveError ? <div className="errorText">{saveError}</div> : null}
    </div>
  );
}
