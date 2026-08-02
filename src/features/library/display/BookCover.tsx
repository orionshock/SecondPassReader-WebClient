import { useMemo, useState } from "react";
import type { CompactBook } from "@secondpass/client";
import { getBookCoverUrl } from "../coverUtils";

export function BookCover({
  book,
  serverBaseUrl,
  size = "small",
}: {
  book: CompactBook;
  serverBaseUrl?: string;
  size?: "small" | "large";
}) {
  const [coverBroken, setCoverBroken] = useState(false);
  const coverSrc = useMemo(
    () => (coverBroken ? undefined : getBookCoverUrl(book, serverBaseUrl ?? null)),
    [book, coverBroken, serverBaseUrl],
  );

  return (
    <div className={`bookCover bookCover${size === "large" ? "Large" : "Small"}`}>
      {coverSrc ? (
        <img
          className="bookCoverImg"
          src={coverSrc}
          alt={`${book.title} cover`}
          loading="lazy"
          onError={() => setCoverBroken(true)}
        />
      ) : (
        <div className="bookCoverPlaceholderText">No cover</div>
      )}
    </div>
  );
}
