import { MaterialIcon } from "../../../components/MaterialIcon";
import type { LibraryAxis } from "../route/libraryRouteState";

type Props = {
  activeAxis: LibraryAxis;
  onShowBooks: () => void;
  onShowSeries: () => void;
  onShowAuthors: () => void;
};

export function LibraryAxisTabs({ activeAxis, onShowBooks, onShowSeries, onShowAuthors }: Props) {
  return (
    <>
      <button type="button" className={`libraryBrowseTab ${activeAxis === "books" ? "libraryBrowseTabActive" : ""}`} onClick={onShowBooks}>
        <MaterialIcon name="menu_book" />Books
      </button>
      <button type="button" className={`libraryBrowseTab ${activeAxis === "series" ? "libraryBrowseTabActive" : ""}`} onClick={onShowSeries}>
        <MaterialIcon name="auto_stories" />Series
      </button>
      <button type="button" className={`libraryBrowseTab ${activeAxis === "authors" ? "libraryBrowseTabActive" : ""}`} onClick={onShowAuthors}>
        <MaterialIcon name="person" />Authors
      </button>
    </>
  );
}
