import { InlineMeta } from "../../../components/MetaSeparator";

export function CurrentAnnotationCardHighlightView({
  descriptionStatus,
  isEditing,
  label,
  locationMetaParts,
  note,
  quoteText,
  when,
}: {
  descriptionStatus: "idle" | "loading" | "ready" | "error";
  isEditing: boolean;
  label: string;
  locationMetaParts: string[];
  note?: string;
  quoteText: string;
  when: string | null;
}) {
  return (
    <>
      <div className="spAnnotationQuote" title={quoteText || "Highlight"}>
        {quoteText || "Highlight"}
      </div>

      {!isEditing && note ? <div className="spAnnotationNote">{note}</div> : null}

      {!isEditing ? (
        <div className="spAnnotationActionRow">
          {locationMetaParts.length > 0 || when || descriptionStatus === "loading" ? (
            <div className="muted spAnnotationActionMeta" title={label}>
              <InlineMeta items={[...locationMetaParts, when]} />
              {descriptionStatus === "loading" ? <span className="muted">{` ${"\u2026"}`}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
