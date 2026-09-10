import { ServerRichText } from "../../components/ServerRichText.Renderer";

export function BookDescription({
  description,
  expanded,
  id,
}: {
  description: string;
  expanded: boolean;
  id: string;
}) {
  return (
    <ServerRichText
      value={description}
      className={`bookDetailSummary ${expanded ? "bookDetailSummaryExpanded" : "bookDetailSummaryCollapsed"}`}
      id={id}
    />
  );
}
