import { useRef, type KeyboardEvent } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import type { LibraryAxis } from "../route/LibraryRoute.State";

type Props = {
  activeAxis: LibraryAxis;
  onShowBooks: () => void;
  onShowSeries: () => void;
  onShowAuthors: () => void;
};

export function LibraryAxisTabs({ activeAxis, onShowBooks, onShowSeries, onShowAuthors }: Props) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabs = [
    { axis: "books", label: "Books", icon: "menu_book", activate: onShowBooks },
    { axis: "authors", label: "Authors", icon: "person", activate: onShowAuthors },
    { axis: "series", label: "Series", icon: "auto_stories", activate: onShowSeries },
  ] as const;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
        : (currentIndex + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  return (
    <div ref={tabListRef} className="libraryAxisTabs" role="tablist" aria-label="Browse by" onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const active = activeAxis === tab.axis;
        return (
          <button
            key={tab.axis}
            id={`library-axis-${tab.axis}-tab`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls="library-axis-results"
            tabIndex={active ? 0 : -1}
            className={`libraryBrowseTab ${active ? "libraryBrowseTabActive" : ""}`}
            onClick={tab.activate}
          >
            <MaterialIcon name={tab.icon} />{tab.label}
          </button>
        );
      })}
    </div>
  );
}
