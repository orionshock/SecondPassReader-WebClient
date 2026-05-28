export function ReaderViewport({ blob }: { blob: Blob }) {
  return (
    <div className="spReaderViewport">
      <div className="muted">ReaderViewport placeholder (epub-ts will mount into a container here)</div>
      <div className="spReaderViewportMount" />
      <div className="muted spReaderViewportMeta">Blob size: {blob.size.toLocaleString()} bytes</div>
    </div>
  );
}

