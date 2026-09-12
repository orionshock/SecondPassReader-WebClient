import { useRef, type KeyboardEvent } from "react";

export type AnnotationWorkspaceTabKey = "current" | "previous";

export function AnnotationWorkspaceTabs({
  tab,
  onChange,
}: {
  tab: AnnotationWorkspaceTabKey;
  onChange: (tab: AnnotationWorkspaceTabKey) => void;
}) {
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabs: Array<{ value: AnnotationWorkspaceTabKey; label: string }> = [
    { value: "current", label: "Current session" },
    { value: "previous", label: "Previous sessions" },
  ];

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? buttons.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    const next = tabs[nextIndex];
    if (!next) return;
    onChange(next.value);
    buttons[nextIndex]?.focus();
  };

  return (
    <div ref={tabListRef} className="spAnnotationTabs" role="tablist" aria-label="Annotation tabs" onKeyDown={handleKeyDown}>
      {tabs.map((item) => (
        <button
          key={item.value}
          id={`annotation-${item.value}-tab`}
          type="button"
          role="tab"
          aria-selected={tab === item.value}
          aria-controls={`annotation-${item.value}-panel`}
          tabIndex={tab === item.value ? 0 : -1}
          className={`spAnnotationTab ${tab === item.value ? "spAnnotationTabActive" : ""}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
