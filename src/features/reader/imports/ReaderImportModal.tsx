import { useState } from "react";

export function ReaderImportModal({
  open,
  onClose,
  onStartImport,
}: {
  open: boolean;
  onClose: () => void;
  onStartImport: (file: File) => Promise<{ warnings?: string[] }>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  if (!open) return null;

  const startImport = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const job = await onStartImport(file);
      setWarnings(job.warnings ?? []);
      setFile(null);
      onClose();
    } catch (err) {
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
            <select className="input" value="glasp-csv" disabled>
              <option value="glasp-csv">Glasp CSV</option>
            </select>
          </label>

          <label className="fieldLabel">
            CSV file
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setError(null);
                setWarnings([]);
                setFile(e.target.files?.[0] ?? null);
              }}
            />
          </label>

          {error ? <div className="errorText">{error}</div> : null}
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
