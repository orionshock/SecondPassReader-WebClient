export function BookDescription({
  description,
  expanded,
  id,
}: {
  description: string;
  expanded: boolean;
  id: string;
}) {
  const html = description.trim();
  if (!html) return null;

  // Book descriptions are a server-sanitized, attribute-free limited HTML contract.
  // Keep the trusted HTML boundary confined to this component.
  return (
    <div
      className={`bookDetailSummary ${expanded ? "bookDetailSummaryExpanded" : "bookDetailSummaryCollapsed"}`}
      id={id}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
