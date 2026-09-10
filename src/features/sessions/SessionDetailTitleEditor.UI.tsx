import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { SESSION_METADATA_LIMITS } from "./SessionMetadata.Policy";

export function SessionDetailTitleEditor({
  displayName,
  savedName,
  isActive,
  draftName,
  setDraftName,
  editingName,
  setEditingName,
  saveBusy,
  saveError,
  clearSaveError,
  onSaveName,
}: {
  displayName: string;
  savedName: string;
  isActive: boolean;
  draftName: string;
  setDraftName: (value: string) => void;
  editingName: boolean;
  setEditingName: (value: boolean) => void;
  saveBusy: boolean;
  saveError: string | null;
  clearSaveError: () => void;
  onSaveName: () => void;
}) {
  return (
    <div className="sessionTitleBlock">
      <div className="panelHeaderRow sessionTitleRow">
        <h2 className="panelTitle sessionTitle">{displayName}</h2>
        {isActive && !editingName ? (
          <button
            type="button"
            className="button buttonCompact sessionTitleEditButton"
            onClick={() => {
              setDraftName(savedName);
              clearSaveError();
              setEditingName(true);
            }}
            aria-label="Edit session name"
            title="Edit session name"
          >
            <MaterialIcon name="edit" />
          </button>
        ) : null}
      </div>

      {isActive && editingName ? (
        <div className="sessionTitleEditRow">
          <input
            className="input inputCompact sessionInlineEditInput"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Session name"
            aria-label="Session name"
            maxLength={SESSION_METADATA_LIMITS.nameMaxChars}
          />
          <button type="button" className="button buttonPrimary buttonCompact" onClick={onSaveName} disabled={saveBusy}>
            Save
          </button>
          <button
            type="button"
            className="button buttonCompact"
            onClick={() => {
              setEditingName(false);
              setDraftName(savedName);
              clearSaveError();
            }}
            disabled={saveBusy}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {editingName && saveError ? <div className="errorText">{saveError}</div> : null}
    </div>
  );
}
