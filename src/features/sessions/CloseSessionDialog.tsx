import { useEffect, useRef, useState } from "react";
import type { LibraryBook } from "@secondpass/client";
import { getBookCoverUrl } from "../library/coverUtils";
import { formatSeriesIndex } from "../library/seriesUtils";

export type CloseSessionAfterAction = "nextBook" | "restartBook" | "home" | "detail" | "sessions";

export type CloseSessionInput = {
  name: string;
  notes: string;
  afterAction: CloseSessionAfterAction;
};

export type CloseSessionAfterOption = {
  action: CloseSessionAfterAction;
  label: string;
};

const DEFAULT_AFTER_OPTIONS: CloseSessionAfterOption[] = [
  { action: "detail", label: "View closed session" },
  { action: "sessions", label: "Go to sessions" },
];

export function CloseSessionDialog({
  initialName,
  initialNotes,
  afterOptions = DEFAULT_AFTER_OPTIONS,
  defaultAfterAction,
  nextBook,
  coverBase,
  onCancel,
  onSaveAndClose,
}: {
  initialName: string;
  initialNotes: string;
  afterOptions?: CloseSessionAfterOption[];
  defaultAfterAction?: CloseSessionAfterAction;
  nextBook?: LibraryBook | null;
  coverBase?: { serverBaseUrl?: string | null; apiBaseUrl?: string | null } | string | null;
  onCancel: () => void;
  onSaveAndClose: (input: CloseSessionInput) => Promise<void>;
}) {
  const initialAfterAction =
    defaultAfterAction && afterOptions.some((option) => option.action === defaultAfterAction)
      ? defaultAfterAction
      : afterOptions[0]?.action ?? "detail";
  const [name, setName] = useState(initialName);
  const [notes, setNotes] = useState(initialNotes);
  const [afterAction, setAfterAction] = useState<CloseSessionAfterAction>(initialAfterAction);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const trimmedName = name.trim();
  const unnamed = trimmedName.length === 0;
  const showNextBookPreview = afterAction === "nextBook" && Boolean(nextBook);
  const nextBookCoverSrc = getBookCoverUrl(nextBook, coverBase);
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
            {afterOptions.map((option) => (
              <label key={option.action} className="closeSessionAfterOption">
                <input
                  type="radio"
                  name="close-session-after"
                  checked={afterAction === option.action}
                  onChange={() => setAfterAction(option.action)}
                  disabled={busy}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>

          {showNextBookPreview && nextBook ? (
            <div className="closeSessionNextPreview">
              <div className="closeSessionNextCover" aria-hidden={nextBookCoverSrc ? undefined : "true"}>
                {nextBookCoverSrc ? (
                  <img className="closeSessionNextCoverImg" src={nextBookCoverSrc} alt={`${nextBook.title} cover`} loading="lazy" />
                ) : (
                  <div className="closeSessionNextCoverPlaceholder">No cover</div>
                )}
              </div>
              <div className="closeSessionNextMain">
                <div className="closeSessionNextEyebrow">Next in series</div>
                <div className="closeSessionNextTitle">{nextBook.title}</div>
                {nextBook.subtitle ? <div className="muted closeSessionNextSubtitle">{nextBook.subtitle}</div> : null}
                {nextBookSeriesIndex ? <div className="muted closeSessionNextMeta">Series index {nextBookSeriesIndex}</div> : null}
              </div>
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
