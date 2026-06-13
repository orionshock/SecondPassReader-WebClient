import type { Ref } from "react";

export function BookSearchInputBar({
  inputRef,
  query,
  ready,
  canSubmitSearch,
  onQueryChange,
  onSubmit,
}: {
  inputRef: Ref<HTMLInputElement>;
  query: string;
  ready: boolean;
  canSubmitSearch: boolean;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="spBookSearchForm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        ref={inputRef}
        className="input spBookSearchInput"
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search text"
        aria-label="Search text"
        disabled={!ready}
      />
      <button type="submit" className="button buttonPrimary spBookSearchButton" disabled={!canSubmitSearch}>
        Search
      </button>
    </form>
  );
}
