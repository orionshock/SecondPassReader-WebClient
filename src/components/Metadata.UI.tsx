import type { ReactNode } from "react";

export function MetaSeparator({ className }: { className?: string }) {
  return <span className={className ? `metaSeparator ${className}` : "metaSeparator"} aria-hidden="true" />;
}

export function InlineMeta({ items }: { items: Array<ReactNode | null | undefined | false> }) {
  const visible = items.filter(Boolean);
  return (
    <>
      {visible.map((item, index) => (
        <span key={index}>
          {index > 0 ? <MetaSeparator /> : null}
          {item}
        </span>
      ))}
    </>
  );
}
