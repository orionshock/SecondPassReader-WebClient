export function NearEndBanner({
  closeSessionFirst,
  disabled,
  nextBookDisabled,
  nextBookBusy,
  message,
  onToggleCloseSessionFirst,
  onGoToStart,
  onNextBook,
  onResume,
}: {
  closeSessionFirst: boolean;
  disabled: boolean;
  nextBookDisabled?: boolean;
  nextBookBusy?: boolean;
  message: string | null;
  onToggleCloseSessionFirst: (checked: boolean) => void;
  onGoToStart: () => void;
  onNextBook: () => void;
  onResume: () => void;
}) {
  return (
    <div className="nearEndBanner" role="note" aria-label="Near end of book actions">
      <span className="nearEndLabel">Near the end</span>
      <span className="sep">·</span>

      <label className="nearEndCheckbox">
        <input
          type="checkbox"
          checked={closeSessionFirst}
          onChange={(e) => onToggleCloseSessionFirst(e.target.checked)}
        />
        close this session first
      </label>

      <span className="sep">·</span>

      <div className="nearEndActions">
        <button type="button" className="button buttonCompact" onClick={onGoToStart}>
          Go to start
        </button>
        <button
          type="button"
          className="button buttonCompact"
          onClick={onNextBook}
          disabled={Boolean(nextBookDisabled) || Boolean(nextBookBusy)}
          title={nextBookDisabled ? "No next book available." : undefined}
        >
          {nextBookBusy ? "Opening..." : "Next book"}
        </button>
      </div>

      <span className="sep">·</span>

      <button type="button" className="button buttonCompact" onClick={onResume} disabled={disabled}>
        Resume
      </button>

      {message ? <span className="nearEndMessage">{message}</span> : null}
    </div>
  );
}
