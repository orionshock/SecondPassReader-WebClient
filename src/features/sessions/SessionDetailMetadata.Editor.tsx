import type { MarginaliaSession } from "@secondpass/client";

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
  if (!isActive) {
    return (
      <div className="sessionReadOnly">
        <div className="sessionClosedNotice muted">
          This session is closed. Name, notes, and annotations are read-only.
        </div>
        {session.notes ? (
          <div className="detailRow">
            <span className="muted">Notes:</span> {session.notes}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="sessionEdit">
      <div className="sessionInlineEditRow">
        <div className="sessionInlineEditLabel">Notes</div>
        {!editingNotes ? (
          <div className="sessionInlineEditFieldRow">
            {session.notes && session.notes.trim() ? (
              <div className="sessionInlineEditValue">{session.notes}</div>
            ) : (
              <div className="sessionInlineEditValue muted">No notes</div>
            )}
            <button
              type="button"
              className="button buttonCompact sessionInlineEditButton"
              onClick={() => {
                setDraftNotes(typeof session.notes === "string" ? session.notes : "");
                setEditingNotes(true);
              }}
              aria-label="Edit session notes"
              title="Edit"
            >
              {"\u270E"}
            </button>
          </div>
        ) : (
          <>
            <div className="sessionInlineEditNotesWrap">
              <textarea
                className="input sessionInlineEditTextarea"
                cols={40}
                rows={4}
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value.slice(0, 500))}
                placeholder={`Notes${"\u2026"}`}
                maxLength={500}
              />
              <div className="sessionInlineEditNotesFooter muted">{draftNotes.length}/500</div>
            </div>
            <div className="sessionInlineEditFieldRow">
              <button type="button" className="button buttonPrimary buttonCompact" onClick={onSaveNotes} disabled={saveBusy}>
                Save
              </button>
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
            </div>
          </>
        )}
      </div>

      {editingNotes && saveError ? <div className="errorText">{saveError}</div> : null}
    </div>
  );
}
