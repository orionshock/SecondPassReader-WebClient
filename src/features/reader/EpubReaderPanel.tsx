import { useEffect, useState } from "react";
import { ReactReader } from "react-reader";

// Renderer spike: keep react-reader usage isolated here.
// TODO: Move renderer interactions behind ReaderBridge before adding annotations/sessions.

export function EpubReaderPanel({
  blob,
  onLocationChanged,
}: {
  blob: Blob;
  onLocationChanged?: (location: string) => void;
}) {
  const [location, setLocation] = useState<string | number>(0);
  const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBookData(null);
    setLoadError(null);
    setLocation(0);

    void (async () => {
      try {
        const buf = await blob.arrayBuffer();
        if (cancelled) return;
        setBookData(buf);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to read EPUB blob.");
        // Safe to log: no tokens, no blob contents.
        // eslint-disable-next-line no-console
        console.error("EPUB blob to ArrayBuffer failed:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (loadError) {
    return <div className="errorText">{loadError}</div>;
  }

  if (!bookData) {
    return <div className="muted" style={{ padding: 12 }}>Preparing EPUB…</div>;
  }

  return (
    <div className="epubContainer">
      <ReactReader
        url={bookData}
        location={location}
        locationChanged={(loc: string) => {
          setLocation(loc);
          onLocationChanged?.(loc);
        }}
        loadingView={<div className="muted" style={{ padding: 12 }}>Loading EPUB…</div>}
        errorView={
          <div className="errorText" style={{ padding: 12 }}>
            Error loading book. See diagnostics above.
          </div>
        }
      />
    </div>
  );
}
