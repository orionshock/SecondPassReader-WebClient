import { useEffect, useState } from "react";
import type { OpenedBook } from "./types";
import { EpubReaderPanel } from "./EpubReaderPanel";

export function ReaderArea({
  openedBook,
  onClose,
}: {
  openedBook: OpenedBook | null;
  onClose: () => void;
}) {
  const [location, setLocation] = useState<string | null>(null);

  useEffect(() => {
    setLocation(null);
  }, [openedBook?.objectUrl]);

  if (!openedBook) {
    return <p className="muted">No book open. Select a book from the library.</p>;
  }

  const authors = (openedBook.book.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");

  return (
    <div className="readerArea">
      <div className="readerHeader">
        <div>
          <div className="readerTitle">{openedBook.book.title}</div>
          {authors ? <div className="muted">{authors}</div> : null}
          {location ? (
            <div className="muted">
              location: <span className="mono">{location}</span>
            </div>
          ) : null}
        </div>
        <div>
          <button type="button" className="button" onClick={onClose}>
            Close reader
          </button>
        </div>
      </div>

      <EpubReaderPanel objectUrl={openedBook.objectUrl} onLocationChanged={setLocation} />
    </div>
  );
}

