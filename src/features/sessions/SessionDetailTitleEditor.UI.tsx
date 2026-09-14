import { MaterialIcon } from "../../components/MaterialIcon.UI";
import { SESSION_METADATA_LIMITS } from "./SessionMetadata.Policy";

export function SessionDetailTitleEditor({
  displayName,
  isActive,
  draftName,
  onChangeName,
  editingName,
  onBeginNameEdit,
  onCancelNameEdit,
  saveBusy,
  saveError,
  onSaveName,
}: {
  displayName: string;
  isActive: boolean;
  draftName: string;
  onChangeName: (value: string) => void;
  editingName: boolean;
  onBeginNameEdit: () => void;
  onCancelNameEdit: () => void;
  saveBusy: boolean;
  saveError: string | null;
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
            onClick={onBeginNameEdit}
            aria-label="Edit Reading Session name"
            title="Edit Reading Session name"
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
            onChange={(event) => onChangeName(event.target.value)}
            placeholder="Reading Session name"
            aria-label="Reading Session name"
            maxLength={SESSION_METADATA_LIMITS.nameMaxChars}
          />
          <button type="button" className="button buttonPrimary buttonCompact" onClick={onSaveName} disabled={saveBusy}>
            Save
          </button>
          <button
            type="button"
            className="button buttonCompact"
            onClick={onCancelNameEdit}
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
