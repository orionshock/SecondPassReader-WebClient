import { useEffect, useRef, useState } from "react";
import type { LibraryBook } from "@secondpass/client";
import { formatSeriesIndex } from "../library/seriesUtils";

export type CloseSessionAfterAction = "detail" | "sessions";

export type CloseSessionInput = {
  name: string;
  notes: string;
  afterAction: CloseSessionAfterAction;
};

export function CloseSessionDialog({
  initialName,
  initialNotes,
  nextBook,
  onCancel,
  onSaveAndClose,
  onStartNextBook,
}: {
  initialName: string;
  initialNotes: string;
  nextBook?: LibraryBook | null;
  onCancel: () => void;
  onSaveAndClose: (input: CloseSessionInput) => Promise<void>;
  onStartNextBook?: (book: LibraryBook) => void;
}) {
  const [name, setName] = useState(initialName);
  const [notes, setNotes] = useState(initialNotes);
  const [afterAction, setAfterAction] = useState<CloseSessionAfterAction>("detail");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const trimmedName = name.trim();
  const unnamed = trimmedName.length === 0;
  const nextBookSeriesIndex = nextBook ? formatSeriesIndex(nextBook.series_index) : null;

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSaveAndClose({ name: trimmedName, notes, afterAction });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close session.");
      setBusy(false);
    }
  }

  return (
    <div className="modalOverlay closeSessionOverlay" role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !busy) onCancel();
    }}>
      <section className="closeSessionDialog" role="dialog" aria-modal="true" aria-labelledby="close-session-title">
        <div className="closeSessionHeader">
          <h2 id="close-session-title" className="closeSessionTitle">Close session</h2>
        </div>

        <div className="closeSessionBody">
          <p className="muted">
            Before closing, you can name this session and add final notes. Closed sessions are historical and cannot be
            renamed or edited later.
          </p>
          {unnamed ? (
            <p className="warningText closeSessionWarning">
              This session has no name. Closed sessions cannot be renamed later. Notes also become read-only.
            </p>
          ) : null}

          <label className="field">
            <span className="fieldLabel">Session name</span>
            <input
              ref={nameRef}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              disabled={busy}
            />
          </label>

          <label className="field">
            <span className="fieldLabel">Session notes</span>
            <textarea
              className="input closeSessionNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              rows={5}
              maxLength={500}
              disabled={busy}
            />
          </label>
          <div className="muted closeSessionCounter">{notes.length}/500</div>

          <fieldset className="closeSessionAfter">
            <legend className="fieldLabel">After closing</legend>
            <label className="closeSessionAfterOption">
              <input
                type="radio"
                name="close-session-after"
                checked={afterAction === "detail"}
                onChange={() => setAfterAction("detail")}
                disabled={busy}
              />
              <span>View session detail</span>
            </label>
            <label className="closeSessionAfterOption">
              <input
                type="radio"
                name="close-session-after"
                checked={afterAction === "sessions"}
                onChange={() => setAfterAction("sessions")}
                disabled={busy}
              />
              <span>Go to sessions</span>
            </label>
            {/* TODO: Add "Start new session from beginning" when the app has a direct reader workflow for it. */}
          </fieldset>

          {nextBook && onStartNextBook ? (
            <div className="closeSessionNextBook">
              <div className="closeSessionNextBookEyebrow">Next in series</div>
              <div className="closeSessionNextBookTitle">{nextBook.title}</div>
              {nextBook.subtitle ? <div className="muted closeSessionNextBookSubtitle">{nextBook.subtitle}</div> : null}
              {nextBookSeriesIndex ? (
                <div className="muted closeSessionNextBookMeta">Series index {nextBookSeriesIndex}</div>
              ) : null}
              <button
                type="button"
                className="button buttonCompact closeSessionNextBookButton"
                onClick={() => onStartNextBook(nextBook)}
                disabled={busy}
              >
                Start next book
              </button>
            </div>
          ) : null}

          {error ? <p className="errorText">{error}</p> : null}
        </div>

        <div className="closeSessionActions">
          <button type="button" className="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="button buttonPrimary" onClick={() => void submit()} disabled={busy}>
            {busy ? `Closing${"\u2026"}` : unnamed ? "Close unnamed session" : "Close session"}
          </button>
        </div>
      </section>
    </div>
  );
}
