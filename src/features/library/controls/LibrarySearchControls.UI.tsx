type Props = {
  draft: string;
  placeholder: string;
  onDraftChange: (value: string) => void;
  onSearch: () => void;
};

export function LibrarySearchControls({ draft, placeholder, onDraftChange, onSearch }: Props) {
  return (
    <div className="librarySearchSection">
      <div className="libraryToolbar">
        <label className="toolbarField toolbarSearch">
          <span className="srOnly">{placeholder}</span>
          <input
            className="input inputCompact"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onSearch();
            }}
            placeholder={placeholder}
            aria-label={placeholder}
          />
        </label>
        <button className="button buttonPrimary librarySearchButton" type="button" onClick={onSearch}>Search</button>
      </div>
    </div>
  );
}
