import type { ReaderBookmark } from "./bookmarkUtils";

export type BookmarkListProps = {
  bookmarks: ReaderBookmark[];
  currentCfi?: string | null;
  onJumpToCfi: (cfi: string) => void;
  onRemoveBookmark: (bookmarkId: string) => void;
};
