import type { Author, Series } from "@secondpass/client";
import { ExpandableText } from "../display/ExpandableText.Control";

type Props =
  | { kind: "series"; series: Series }
  | { kind: "author"; author: Author };

export function LibrarySelectedAxisHeader(props: Props) {
  const entity = props.kind === "series" ? props.series : props.author;
  const text = props.kind === "series" ? props.series.summary?.trim() ?? "" : props.author.biography?.trim() ?? "";
  const label = props.kind === "series" ? "series summary" : "author biography";
  return (
    <div className="libraryBrowseHeader">
      <div>
        <div className="panelTitle" style={{ margin: 0 }}>{entity.name}</div>
        <ExpandableText key={`${props.kind}-${String(entity.id)}`} text={text} collapsedLines={1} className="libraryBrowseHeaderText" label={label} />
      </div>
    </div>
  );
}
