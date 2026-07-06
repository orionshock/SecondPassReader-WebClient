import type { LibraryBook } from "@secondpass/client";
import { CloseSessionDialog, type CloseSessionAfterOption, type CloseSessionInput } from "../../sessions/CloseSessionDialog";
import { EndOfBookDialog } from "../EndOfBookDialog";
import { ReaderImportModal } from "../imports/ReaderImportModal";
import { BookSearchDrawer } from "../shell/bookSearch/BookSearchDrawer";
import type { ReaderActivityRenderState } from "./readerActivityTypes";

export function ReaderActivityDialogs({
  bookId,
  bookTitle,
  searchOpen,
  search,
  initialSearchQuery,
  onCloseSearch,
  importModalOpen,
  onCloseImportModal,
  onStartImport,
  onStartSplSessionJsonImport,
  onOpenExportSplitter,
  closeDialogOpen,
  closeInitialName,
  closeInitialNotes,
  closeAfterOptions,
  defaultAfterAction,
  nextBook,
  coverBase,
  onCancelCloseSession,
  onSaveAndCloseSession,
  endBookDialogOpen,
  nextBookStatus,
  hasSeries,
  onStartNextBook,
  onFinishSession,
  onKeepReading,
  onGoToLibrary,
  returnLabel,
}: {
  bookId: string | number;
  bookTitle: string;
  searchOpen: boolean;
  search: ReaderActivityRenderState["search"];
  initialSearchQuery?: string | null;
  onCloseSearch: () => void;
  importModalOpen: boolean;
  onCloseImportModal: () => void;
  onStartImport: (file: File) => Promise<{ warnings?: string[] }>;
  onStartSplSessionJsonImport: (file: File) => Promise<{ warnings?: string[] }>;
  onOpenExportSplitter: () => void;
  closeDialogOpen: boolean;
  closeInitialName: string;
  closeInitialNotes: string;
  closeAfterOptions: CloseSessionAfterOption[];
  defaultAfterAction: CloseSessionInput["afterAction"];
  nextBook: LibraryBook | null;
  coverBase: { apiBaseUrl: string | null };
  onCancelCloseSession: () => void;
  onSaveAndCloseSession: (input: CloseSessionInput) => Promise<void>;
  endBookDialogOpen: boolean;
  nextBookStatus: "idle" | "loading" | "ready" | "error";
  hasSeries: boolean;
  onStartNextBook: (book: LibraryBook) => void;
  onFinishSession: () => void;
  onKeepReading: () => void;
  onGoToLibrary?: () => void;
  returnLabel: string;
}) {
  return (
    <>
      <BookSearchDrawer
        key={String(bookId)}
        open={searchOpen}
        ready={search.ready}
        searchBook={search.searchBook}
        bookTitle={bookTitle}
        initialSearchQuery={initialSearchQuery}
        onClose={onCloseSearch}
        onJump={(result) => {
          search.jumpToResult(result.cfi);
        }}
      />

      <ReaderImportModal
        open={importModalOpen}
        onClose={onCloseImportModal}
        onStartImport={onStartImport}
        onStartSplSessionJsonImport={onStartSplSessionJsonImport}
        onOpenExportSplitter={onOpenExportSplitter}
      />

      {closeDialogOpen ? (
        <CloseSessionDialog
          initialName={closeInitialName}
          initialNotes={closeInitialNotes}
          afterOptions={closeAfterOptions}
          defaultAfterAction={defaultAfterAction}
          nextBook={nextBook}
          coverBase={coverBase}
          onCancel={onCancelCloseSession}
          onSaveAndClose={onSaveAndCloseSession}
        />
      ) : null}

      {endBookDialogOpen ? (
        <EndOfBookDialog
          nextBook={nextBook}
          nextBookStatus={nextBookStatus}
          coverBase={coverBase}
          hasSeries={hasSeries}
          onStartNextBook={onStartNextBook}
          onFinishSession={onFinishSession}
          onKeepReading={onKeepReading}
          onGoToLibrary={onGoToLibrary}
          returnLabel={returnLabel}
        />
      ) : null}
    </>
  );
}
