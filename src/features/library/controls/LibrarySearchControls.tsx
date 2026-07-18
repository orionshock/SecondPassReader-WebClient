type Props = {
  draft: string;
  pageSize: number;
  onDraftChange: (value: string) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSearch: () => void;
};

export function LibrarySearchControls({ draft, pageSize, onDraftChange, onPageSizeChange, onSearch }: Props) {
  return (
    <div className="librarySearchSection">
      <div className="libraryToolbar">
        <label className="toolbarField toolbarSearch">
          <span className="srOnly">Search</span>
          <input
            className="input inputCompact"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onSearch();
            }}
            placeholder="Search the library..."
          />
        </label>
        <label className="toolbarField">
          <span className="srOnly">Page size</span>
          <select className="input inputCompact" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button className="button buttonPrimary librarySearchButton" type="button" onClick={onSearch}>Search</button>
      </div>
    </div>
  );
}
