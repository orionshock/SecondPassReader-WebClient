import { MaterialIcon } from "./MaterialIcon.UI";

export type OrderingOption<T extends string> = {
  value: T;
  label: string;
  icon?: string;
  title?: string;
};

export function OrderingControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<OrderingOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  if (options.length === 0) return null;

  return (
    <div className="orderingControl" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`orderingControlButton ${active ? "orderingControlButtonActive" : ""}`}
            onClick={() => onChange(option.value)}
            title={option.title ?? option.label}
            aria-pressed={active}
          >
            {option.icon ? <MaterialIcon name={option.icon} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
