import type { LibraryAuthor, LibrarySeries } from "@secondpass/client";
import { ExpandableText } from "../display/ExpandableText";

type Props =
  | { kind: "series"; series: LibrarySeries }
  | { kind: "author"; author: LibraryAuthor };

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
