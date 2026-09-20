import { useRef } from "react";
import type { CompactBook } from "@secondpass/client";
import { getBookCoverUrl } from "../library/BookCover.Mapper";
import { formatSeriesIndex } from "../library/SeriesMetadata.Presenter";
import { SESSION_METADATA_LIMITS } from "./SessionMetadata.Policy";
import { useModalDialogFocus } from "../../components/ModalDialogFocus.Lifecycle";
import { useCloseSession } from "./CloseSession.Controller";

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
  { action: "detail", label: "View closed Reading Session" },
  { action: "sessions", label: "Go to Reading Sessions" },
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
  nextBook?: CompactBook | null;
  coverBase?: { serverBaseUrl?: string | null; apiRootUrl?: string | null } | string | null;
  onCancel: () => void;
  onSaveAndClose: (input: CloseSessionInput) => Promise<void>;
}) {
  const { name, notes, afterAction, busy, error, changeName, changeNotes, chooseAfterAction, submit } = useCloseSession({
    initialName, initialNotes, afterOptions, defaultAfterAction, onSaveAndClose,
  });
  const nameRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  const trimmedName = name.trim();
  const unnamed = trimmedName.length === 0;
  const showNextBookPreview = afterAction === "nextBook" && Boolean(nextBook);
  const nextBookCoverSrc = getBookCoverUrl(nextBook, coverBase);
  const nextBookSeriesIndex = nextBook ? formatSeriesIndex(nextBook.series?.seriesIndex) : null;

  useModalDialogFocus({ active: true, dialogRef, initialFocusRef: nameRef, onDismiss: onCancel, dismissDisabled: busy });

  return (
    <div className="modalOverlay closeSessionOverlay" role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !busy) onCancel();
    }}>
      <section ref={dialogRef} className="closeSessionDialog" role="dialog" aria-modal="true" aria-labelledby="close-session-title" tabIndex={-1}>
        <div className="closeSessionHeader">
          <h2 id="close-session-title" className="closeSessionTitle">Close Reading Session</h2>
        </div>

        <div className="closeSessionBody">
          <p className="muted">
            Review the name and notes before closing. Closed Reading Sessions cannot be edited.
          </p>
          {unnamed ? (
            <p id="close-session-name-warning" className="warningText closeSessionWarning">
              This Reading Session has no name. Closing it now will leave it unnamed and read-only.
            </p>
          ) : null}

          <label className="field">
            <span className="fieldLabel">Reading Session name</span>
            <input
              ref={nameRef}
              className="input"
              value={name}
              onChange={(e) => changeName(e.target.value)}
              maxLength={SESSION_METADATA_LIMITS.nameMaxChars}
              disabled={busy}
              aria-describedby={unnamed ? "close-session-name-warning" : undefined}
            />
          </label>

          <label className="field">
            <span className="fieldLabel">Reading Session notes</span>
            <textarea
              className="input closeSessionNotes"
              value={notes}
              onChange={(e) => changeNotes(e.target.value.slice(0, SESSION_METADATA_LIMITS.notesMaxChars))}
              rows={5}
              maxLength={SESSION_METADATA_LIMITS.notesMaxChars}
              disabled={busy}
            />
          </label>
          <div className="muted closeSessionCounter">{notes.length}/{SESSION_METADATA_LIMITS.notesMaxChars}</div>

          <fieldset className="closeSessionAfter">
            <legend className="fieldLabel">After closing</legend>
            {afterOptions.map((option) => (
              <label key={option.action} className="closeSessionAfterOption">
                <input
                  type="radio"
                  name="close-session-after"
                  checked={afterAction === option.action}
                  onChange={() => chooseAfterAction(option.action)}
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

          {error ? <p className="errorText" role="alert">{error}</p> : null}
        </div>

        <div className="closeSessionActions">
          <button type="button" className="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="button buttonPrimary" onClick={() => void submit()} disabled={busy}>
            {busy ? `Closing${"\u2026"}` : unnamed ? "Close unnamed Reading Session" : "Close Reading Session"}
          </button>
        </div>
      </section>
    </div>
  );
}
