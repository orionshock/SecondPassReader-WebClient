export type ShelfFormValues = {
  name: string;
  description: string;
  visibility: "private" | "listed";
};

export function ShelfForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
}: {
  values: ShelfFormValues;
  onChange: (values: ShelfFormValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  return (
    <form
      className="form shelfEditForm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span className="fieldLabel">Name</span>
        <input
          className="input inputCompact"
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
          maxLength={255}
          required
        />
      </label>

      <label className="field">
        <span className="fieldLabel">Description</span>
        <textarea
          className="input shelfEditDescription"
          value={values.description}
          onChange={(e) => onChange({ ...values, description: e.target.value })}
          rows={3}
        />
      </label>

      <label className="field">
        <span className="fieldLabel">Visibility</span>
        <select
          className="input inputCompact"
          value={values.visibility}
          onChange={(e) => onChange({ ...values, visibility: e.target.value === "listed" ? "listed" : "private" })}
        >
          <option value="private">Private</option>
          <option value="listed">Listed</option>
        </select>
      </label>

      <div className="formActions">
        <button type="submit" className="button buttonPrimary buttonCompact" disabled={busy || !values.name.trim()}>
          {submitLabel}
        </button>
        <button type="button" className="button buttonCompact" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
