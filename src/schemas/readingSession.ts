export type ReadingSession = {
  id: string;
  bookId: string;
  startedAt: string;
  endedAt?: string | null;
  currentLocation?: {
    epubCfi: string;
    progression?: number | null;
    updatedAt?: string;
  } | null;
  isActive: boolean;
};

