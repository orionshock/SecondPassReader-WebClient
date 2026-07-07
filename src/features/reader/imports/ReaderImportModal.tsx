import { useState } from "react";
import "./handlers/registerBuiltInReaderImportHandlers";
import { getReaderImportHandlers, ReaderImportParseError, type ReaderImportFailureAction } from "./readerImportFormats";

export function ReaderImportModal({
  open,
  onClose,
  onStartImport,
  onParseAction,
}: {
  open: boolean;
  onClose: () => void;
  onStartImport: (format: string, file: File) => Promise<{ warnings?: string[] }>;
  onParseAction: (action: ReaderImportFailureAction) => void;
}) {
  const formats = getReaderImportHandlers();
  const [format, setFormat] = useState<string>(() => formats[0]?.kind ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failureAction, setFailureAction] = useState<ReaderImportFailureAction | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  if (!open) return null;

  const selectedFormat = formats.find((item) => item.kind === format) ?? formats[0];
  if (!selectedFormat) {
    return (
      <div className="spReaderModalBackdrop" role="presentation" onPointerDown={onClose}>
        <section className="spReaderImportModal" role="dialog" aria-modal="true" aria-labelledby="sp-reader-import-title" onPointerDown={(e) => e.stopPropagation()}>
          <div className="spReaderImportModalHeader">
            <h2 id="sp-reader-import-title">Import marginalia</h2>
            <button type="button" className="button buttonCompact" onClick={onClose}>Close</button>
          </div>
          <div className="spReaderImportModalBody">
            <div className="errorText">No import formats are available.</div>
          </div>
        </section>
      </div>
    );
  }

  const startImport = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setFailureAction(null);
    setWarnings([]);
    try {
      const job = await onStartImport(format, file);
      setWarnings(job.warnings ?? []);
      setFile(null);
      onClose();
    } catch (err) {
      if (err instanceof ReaderImportParseError) setFailureAction(err.action ?? null);
      setError(err instanceof Error ? err.message : "Failed to parse import file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="spReaderModalBackdrop" role="presentation" onPointerDown={onClose}>
      <section
        className="spReaderImportModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sp-reader-import-title"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="spReaderImportModalHeader">
          <h2 id="sp-reader-import-title">Import marginalia</h2>
          <button type="button" className="button buttonCompact" onClick={onClose}>Close</button>
        </div>

        <div className="spReaderImportModalBody">
          <label className="fieldLabel">
            Format
            <select
              className="input"
              value={format}
              onChange={(e) => {
                setFormat(e.currentTarget.value);
                setError(null);
                setFailureAction(null);
                setWarnings([]);
                setFile(null);
              }}
            >
              {formats.map((item) => (
                <option key={item.kind} value={item.kind}>{item.displayName}</option>
              ))}
            </select>
          </label>
          <div className="muted spReaderImportWarnings">{selectedFormat.description}</div>

          <label className="fieldLabel">
            Import file
            <input
              className="input"
              type="file"
              accept={selectedFormat.accept}
              onChange={(e) => {
                setError(null);
                setFailureAction(null);
                setWarnings([]);
                setFile(e.target.files?.[0] ?? null);
              }}
            />
          </label>

          {error ? <div className="errorText">{error}</div> : null}
          {failureAction ? (
            <button type="button" className="button buttonCompact" onClick={() => onParseAction(failureAction)}>
              {failureAction.label}
            </button>
          ) : null}
          {warnings.length > 0 ? (
            <div className="muted spReaderImportWarnings">{warnings.join(" ")}</div>
          ) : null}
        </div>

        <div className="spReaderImportModalActions">
          <button type="button" className="button buttonCompact" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="button buttonPrimary" onClick={startImport} disabled={!file || busy}>
            {busy ? "Parsing..." : "Start import"}
          </button>
        </div>
      </section>
    </div>
  );
}
