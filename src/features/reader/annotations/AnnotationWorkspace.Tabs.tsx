export type AnnotationWorkspaceTabKey = "current" | "previous";

export function AnnotationWorkspaceTabs({
  tab,
  onChange,
}: {
  tab: AnnotationWorkspaceTabKey;
  onChange: (tab: AnnotationWorkspaceTabKey) => void;
}) {
  return (
    <div className="spAnnotationTabs" role="tablist" aria-label="Annotation tabs">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "current"}
        className={`spAnnotationTab ${tab === "current" ? "spAnnotationTabActive" : ""}`}
        onClick={() => onChange("current")}
      >
        Current session
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "previous"}
        className={`spAnnotationTab ${tab === "previous" ? "spAnnotationTabActive" : ""}`}
        onClick={() => onChange("previous")}
      >
        Previous sessions
      </button>
    </div>
  );
}
