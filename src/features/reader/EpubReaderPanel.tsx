import { useState } from "react";
import { ReactReader } from "react-reader";

// Renderer spike: keep react-reader usage isolated here.
// TODO: Move renderer interactions behind ReaderBridge before adding annotations/sessions.

export function EpubReaderPanel({
  objectUrl,
  onLocationChanged,
}: {
  objectUrl: string;
  onLocationChanged?: (location: string) => void;
}) {
  const [location, setLocation] = useState<string | number>(0);

  return (
    <div className="epubContainer">
      <ReactReader
        url={objectUrl}
        location={location}
        locationChanged={(loc: string) => {
          setLocation(loc);
          onLocationChanged?.(loc);
        }}
      />
    </div>
  );
}

