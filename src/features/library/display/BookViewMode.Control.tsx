import type { LibraryBooksView } from "../../../storage/LibraryBooksView.Store";

export function BookViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: LibraryBooksView;
  onChange: (viewMode: LibraryBooksView) => void;
}) {
  return (
    <div className="libraryViewToggle" role="group" aria-label="Book display">
      <button
        type="button"
        className={`libraryViewToggleButton ${viewMode === "list" ? "libraryViewToggleButtonActive" : ""}`}
        onClick={() => onChange("list")}
        aria-pressed={viewMode === "list"}
      >
        List
      </button>
      <button
        type="button"
        className={`libraryViewToggleButton ${viewMode === "grid" ? "libraryViewToggleButtonActive" : ""}`}
        onClick={() => onChange("grid")}
        aria-pressed={viewMode === "grid"}
      >
        Grid
      </button>
    </div>
  );
}
