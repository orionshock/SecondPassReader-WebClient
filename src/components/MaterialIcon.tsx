export function MaterialIcon({
  name,
  className,
  filled = false,
  ariaHidden = true,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  ariaHidden?: boolean;
}) {
  const baseClass = filled ? "material-symbols-outlined spIconFilled" : "material-symbols-outlined";
  const cls = className ? `${baseClass} ${className}` : baseClass;
  return (
    <span className={cls} aria-hidden={ariaHidden}>
      {name}
    </span>
  );
}

