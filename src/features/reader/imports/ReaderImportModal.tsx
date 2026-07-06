import { useState } from "react";
import { SplMarginaliaSessionCountError } from "./splMarginaliaSessionImport";

type ReaderImportModalFormat = "glasp-csv" | "spl-session-json";

export function ReaderImportModal({
  open,
  onClose,
  onStartImport,
  onStartSplSessionJsonImport,
  onOpenExportSplitter,
}: {
  open: boolean;
  onClose: () => void;
  onStartImport: (file: File) => Promise<{ warnings?: string[] }>;
  onStartSplSessionJsonImport: (file: File) => Promise<{ warnings?: string[] }>;
  onOpenExportSplitter: () => void;
}) {
  const [format, setFormat] = useState<ReaderImportModalFormat>("glasp-csv");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multiSessionError, setMultiSessionError] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  if (!open) return null;

  const startImport = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMultiSessionError(false);
    setWarnings([]);
    try {
      const job = format === "spl-session-json" ? await onStartSplSessionJsonImport(file) : await onStartImport(file);
      setWarnings(job.warnings ?? []);
      setFile(null);
      onClose();
    } catch (err) {
      if (err instanceof SplMarginaliaSessionCountError) setMultiSessionError(err.sessionCount > 1);
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
                setFormat(e.currentTarget.value as ReaderImportModalFormat);
                setError(null);
                setMultiSessionError(false);
                setWarnings([]);
                setFile(null);
              }}
            >
              <option value="glasp-csv">Glasp CSV</option>
              <option value="spl-session-json">SecondPassMarginaliaExport session JSON</option>
            </select>
          </label>

          <label className="fieldLabel">
            {format === "spl-session-json" ? "Session JSON file" : "CSV file"}
            <input
              className="input"
              type="file"
              accept={format === "spl-session-json" ? "application/json,.json" : ".csv,text/csv"}
              onChange={(e) => {
                setError(null);
                setMultiSessionError(false);
                setWarnings([]);
                setFile(e.target.files?.[0] ?? null);
              }}
            />
          </label>

          {error ? <div className="errorText">{error}</div> : null}
          {multiSessionError ? (
            <button type="button" className="button buttonCompact" onClick={onOpenExportSplitter}>
              Open export splitter
            </button>
          ) : null}
          {warnings.length > 0 ? (
            <div className="muted spReaderImportWarnings">{warnings.join(" ")}</div>
          ) : null}
        </div>

        <div className="spReaderImportModalActions">
          <button type="button" className="button buttonCompact" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="button buttonPrimary" onClick={startImport} disabled={!file || busy}>
            {busy ? "Parsing..." : format === "spl-session-json" ? "Stage session" : "Start import"}
          </button>
        </div>
      </section>
    </div>
  );
}
