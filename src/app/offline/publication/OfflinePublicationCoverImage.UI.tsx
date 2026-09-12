import { useEffect, useState } from "react";

type CoverSource = { blob: Blob; url: string } | null;

export function OfflinePublicationCoverImage({
  blob,
  alt,
  imageClassName,
  placeholderClassName,
  placeholderText = "No cover",
}: {
  blob: Blob | null;
  alt: string;
  imageClassName: string;
  placeholderClassName: string;
  placeholderText?: string;
}) {
  const [coverSource, setCoverSource] = useState<CoverSource>(null);
  const [brokenSource, setBrokenSource] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setCoverSource(null);
      return;
    }
    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(blob);
    } catch {
      setCoverSource(null);
      return;
    }
    setCoverSource({ blob, url: objectUrl });
    // The component owns only this derived URL; the durable Blob remains repository-owned.
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const source = coverSource && coverSource.blob === blob ? coverSource.url : null;

  return source && brokenSource !== source ? (
    <img
      className={imageClassName}
      src={source}
      alt={alt}
      loading="lazy"
      onError={() => setBrokenSource(source)}
    />
  ) : (
    <div className={placeholderClassName} aria-hidden="true">{placeholderText}</div>
  );
}
