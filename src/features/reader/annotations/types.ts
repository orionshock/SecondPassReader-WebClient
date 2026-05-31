import type { ReaderBookmarkViewModel } from "./bookmarkUtils";

export type BookmarkListProps = {
  bookmarks: ReaderBookmarkViewModel[];
  currentCfi?: string | null;
  onJumpToCfi: (cfi: string) => void;
  onRemoveBookmark: (bookmarkId: string) => void;
};
