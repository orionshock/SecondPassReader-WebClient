import DOMPurify, { type Config } from "dompurify";
import type { CSSProperties, ReactNode } from "react";

const SERVER_RICH_TEXT_SANITIZER_CONFIG: Config = {
  ALLOWED_TAGS: ["p", "br", "b", "strong", "i", "em", "ul", "ol", "li"],
  ALLOWED_ATTR: [],
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
};

type Props = {
  value?: string | null;
  className?: string;
  id?: string;
  style?: CSSProperties;
  emptyFallback?: ReactNode;
};

export function ServerRichText({ value, className, id, style, emptyFallback }: Props) {
  const html = typeof value === "string" ? value.trim() : "";
  const classes = ["serverRichText", className].filter(Boolean).join(" ");

  if (!html) {
    return emptyFallback == null ? null : (
      <div className={classes} id={id} style={style}>
        {emptyFallback}
      </div>
    );
  }

  // DOMPurify has no DOM-backed sanitizer during Node-only rendering. Fail
  // closed there by letting React escape the value instead of using the HTML sink.
  if (typeof DOMPurify.sanitize !== "function") {
    return (
      <div className={classes} id={id} style={style}>
        {html}
      </div>
    );
  }

  // The server owns the product sanitization policy. This matching sink
  // allowlist is defense-in-depth at the sole client HTML rendering boundary.
  const sanitizedHtml = DOMPurify.sanitize(html, SERVER_RICH_TEXT_SANITIZER_CONFIG);

  return (
    <div
      className={classes}
      id={id}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}