import { useEffect, useState } from "react";
import type { LibraryAuthor, LibrarySeries, SecondPassClient } from "@secondpass/client";

type UseSelectedLibraryEntityInput = {
  spl: SecondPassClient | null;
  selectedAuthorId?: string;
  selectedSeriesId?: string;
  canLoad: boolean;
};

type UseSelectedLibraryEntityResult = {
  selectedAuthorData: LibraryAuthor | null;
  selectedSeriesData: LibrarySeries | null;
};

export function useSelectedLibraryEntity({
  spl,
  selectedAuthorId,
  selectedSeriesId,
  canLoad,
}: UseSelectedLibraryEntityInput): UseSelectedLibraryEntityResult {
  const [selectedAuthorData, setSelectedAuthorData] = useState<LibraryAuthor | null>(null);
  const [selectedSeriesData, setSelectedSeriesData] = useState<LibrarySeries | null>(null);

  useEffect(() => {
    if (!canLoad || !spl) return;

    let cancelled = false;

    if (selectedSeriesId) {
      void (async () => {
        try {
          const series = await spl.library.series.get(selectedSeriesId, { includePreviewBooks: true });
          if (!cancelled) setSelectedSeriesData(series);
        } catch {
          if (!cancelled) setSelectedSeriesData(null);
        }
      })();
    } else {
      setSelectedSeriesData(null);
    }

    if (selectedAuthorId) {
      void (async () => {
        try {
          const author = await spl.library.authors.get(selectedAuthorId, { includePreviewBooks: true });
          if (!cancelled) setSelectedAuthorData(author);
        } catch {
          if (!cancelled) setSelectedAuthorData(null);
        }
      })();
    } else {
      setSelectedAuthorData(null);
    }

    return () => {
      cancelled = true;
    };
  }, [canLoad, selectedAuthorId, selectedSeriesId, spl]);

  return { selectedAuthorData, selectedSeriesData };
}
