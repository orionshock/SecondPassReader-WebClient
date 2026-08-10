export function SettingsDetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="detailRow">
      <span className="muted">{label}:</span> <span className={mono ? "mono" : undefined}>{value}</span>
    </div>
  );
}
