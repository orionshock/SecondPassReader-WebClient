import type { CompactBook } from "@secondpass/client";
import { CloseSessionDialog, type CloseSessionAfterOption, type CloseSessionInput } from "../../sessions/CloseSession.Dialog";
import { EndOfBookDialog } from "../ReaderEndOfBook.Dialog";
import { ReaderImportModal } from "../imports/ReaderImport.Modal";
import type { ReaderImportFailureAction } from "../imports/ReaderImportFormats.Registry";
import { BookSearchDrawer } from "../shell/bookSearch/ReaderBookSearch.Drawer";
import type { ReaderActivityRenderState } from "./ReaderActivity.Types";

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
  onParseImportAction,
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
  onStartImport: (format: string, file: File) => Promise<{ warnings?: string[] }>;
  onParseImportAction: (action: ReaderImportFailureAction) => void;
  closeDialogOpen: boolean;
  closeInitialName: string;
  closeInitialNotes: string;
  closeAfterOptions: CloseSessionAfterOption[];
  defaultAfterAction: CloseSessionInput["afterAction"];
  nextBook: CompactBook | null;
  coverBase: { apiBaseUrl: string | null };
  onCancelCloseSession: () => void;
  onSaveAndCloseSession: (input: CloseSessionInput) => Promise<void>;
  endBookDialogOpen: boolean;
  nextBookStatus: "idle" | "loading" | "ready" | "error";
  hasSeries: boolean;
  onStartNextBook: (book: CompactBook) => void;
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
        onParseAction={onParseImportAction}
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
