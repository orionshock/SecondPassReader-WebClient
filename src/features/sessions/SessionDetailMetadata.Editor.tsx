import type { MarginaliaSession } from "@secondpass/client";

export function SessionDetailMetadataEditor({
  session,
  isActive,
  draftName,
  setDraftName,
  draftNotes,
  setDraftNotes,
  editingName,
  setEditingName,
  editingNotes,
  setEditingNotes,
  saveBusy,
  saveError,
  clearSaveError,
  onSaveName,
  onSaveNotes,
}: {
  session: MarginaliaSession;
  isActive: boolean;
  draftName: string;
  setDraftName: (value: string) => void;
  draftNotes: string;
  setDraftNotes: (value: string) => void;
  editingName: boolean;
  setEditingName: (value: boolean) => void;
  editingNotes: boolean;
  setEditingNotes: (value: boolean) => void;
  saveBusy: boolean;
  saveError: string | null;
  clearSaveError: () => void;
  onSaveName: () => void;
  onSaveNotes: () => void;
}) {
  if (!isActive) {
    return (
      <div className="sessionReadOnly">
        <div className="sessionClosedNotice muted">
          This session is closed. Name, notes, and annotations are read-only.
        </div>
        {session.name ? (
          <div className="detailRow">
            <span className="muted">Name:</span> {session.name}
          </div>
        ) : null}
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
        <div className="sessionInlineEditLabel">Name</div>
        {!editingName ? (
          <div className="sessionInlineEditFieldRow">
            {session.name && session.name.trim() ? (
              <div className="sessionInlineEditValue">{session.name}</div>
            ) : (
              <div className="sessionInlineEditValue muted">Unnamed session</div>
            )}
            <button
              type="button"
              className="button buttonCompact sessionInlineEditButton"
              onClick={() => {
                setDraftName(typeof session.name === "string" ? session.name : "");
                setEditingName(true);
              }}
              aria-label="Edit session name"
              title="Edit"
            >
              {"\u270E"}
            </button>
          </div>
        ) : (
          <div className="sessionInlineEditFieldRow">
            <input
              className="input inputCompact sessionInlineEditInput"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Session name"
              maxLength={255}
            />
            <button type="button" className="button buttonPrimary buttonCompact" onClick={onSaveName} disabled={saveBusy}>
              Save
            </button>
            <button
              type="button"
              className="button buttonCompact"
              onClick={() => {
                setEditingName(false);
                setDraftName(typeof session.name === "string" ? session.name : "");
                clearSaveError();
              }}
              disabled={saveBusy}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

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

      {saveError ? <div className="errorText">{saveError}</div> : null}
    </div>
  );
}
