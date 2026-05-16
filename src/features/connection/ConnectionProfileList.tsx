import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { getConnectionStatus, getConnectionStatusLabel } from "./connectionStatus";

type Props = {
  profiles: ConnectionProfile[];
  selectedProfileId?: string | null;
  onSelect: (profileId: string) => void;
  onDelete: (profileId: string) => void;
};

export function ConnectionProfileList({ profiles, selectedProfileId, onSelect, onDelete }: Props) {
  if (profiles.length === 0) {
    return <p className="muted">No saved profiles yet.</p>;
  }

  return (
    <ul className="profileList">
      {profiles.map((profile) => {
        const selected = profile.id === selectedProfileId;
        const status = getConnectionStatus(profile);
        const primary = profile.label?.trim() ? profile.label : profile.serverBaseUrl;
        return (
          <li key={profile.id} className={`profileRow ${selected ? "profileRowSelected" : ""}`}>
            <div className="profileMain">
              <div className="profileTop">
                <span className="profileLabel">{primary}</span>
                <div className="badgeRow">
                  {selected ? <span className="profileSelectedMark">Selected</span> : null}
                  {status === "linked" ? <span className="badge badgeWarn">Linked</span> : null}
                  {status === "verified" ? <span className="badge badgeOk">Verified</span> : null}
                </div>
              </div>
              <div className="profileMeta">
                <div className="mono">{profile.serverBaseUrl}</div>
                {profile.serverName ? (
                  <div>
                    <span className="muted">Name:</span> {profile.serverName}
                  </div>
                ) : null}
                {status !== "not_configured" ? (
                  <div>
                    <span className="muted">Status:</span> {getConnectionStatusLabel(status)}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="profileActions">
              <button type="button" className="button" onClick={() => onSelect(profile.id)}>
                Select
              </button>
              <button
                type="button"
                className="button buttonDanger"
                onClick={() => onDelete(profile.id)}
                aria-label={`Delete profile ${profile.label}`}
              >
                Delete
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
