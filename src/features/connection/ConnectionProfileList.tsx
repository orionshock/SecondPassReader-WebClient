import type { ConnectionProfile } from "../../storage/connectionProfiles";

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
        return (
          <li key={profile.id} className={`profileRow ${selected ? "profileRowSelected" : ""}`}>
            <div className="profileMain">
              <div className="profileTop">
                <span className="profileLabel">{profile.label}</span>
                {selected ? <span className="profileSelectedMark">Selected</span> : null}
              </div>
              <div className="profileMeta">
                <div>
                  <span className="muted">Server:</span> <span className="mono">{profile.serverBaseUrl}</span>
                </div>
                {profile.serverName ? (
                  <div>
                    <span className="muted">Name:</span> {profile.serverName}
                  </div>
                ) : null}
                {profile.linkedAt ? (
                  <div>
                    <span className="muted">Link:</span> <span className="pill pillOk">linked</span>
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
