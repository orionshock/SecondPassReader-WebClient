import { useState } from "react";
import { ServerRichText } from "../../../components/ServerRichText.Renderer";

export function ExpandableText({
  text,
  collapsedLines = 4,
  className,
  label = "Text",
}: {
  text?: string | null;
  collapsedLines?: number;
  className?: string;
  label?: string;
}) {
  const cleaned = typeof text === "string" ? text.trim() : "";
  const [expanded, setExpanded] = useState(false);

  if (!cleaned) return null;

  const probablyLong = cleaned.length > collapsedLines * 90 || cleaned.split(/\r?\n/).length > collapsedLines;
  const textClassName = [
    "expandableTextBody",
    !expanded && probablyLong ? "expandableTextBodyCollapsed" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={`expandableText${className ? ` ${className}` : ""}`}>
      <ServerRichText
        value={cleaned}
        className={textClassName}
        style={{ WebkitLineClamp: !expanded && probablyLong ? collapsedLines : undefined }}
      />
      {probablyLong ? (
        <button
          type="button"
          className="expandableTextToggle"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Show more"}
          <span className="srOnly">{` ${label}`}</span>
        </button>
      ) : null}
    </div>
  );
}
