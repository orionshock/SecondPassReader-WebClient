import { lazy, Suspense } from "react";
import type { ShelfFormValues } from "./ShelfForm.Types";

const LimitedRichTextEditor = lazy(async () => {
  const module = await import("../../components/LimitedRichTextEditor.UI");
  return { default: module.LimitedRichTextEditor };
});

export function ShelfForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
  descriptionError,
}: {
  values: ShelfFormValues;
  onChange: (values: ShelfFormValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  busy: boolean;
  descriptionError?: string | null;
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

      <Suspense fallback={<div className="muted limitedRichTextLoading" role="status">Loading description editor...</div>}>
        <LimitedRichTextEditor
          id="shelf-description"
          label="Description"
          value={values.description}
          onChange={(description) => onChange({ ...values, description })}
          disabled={busy}
          error={descriptionError}
        />
      </Suspense>

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