import { useMemo } from "react";
import type { SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { navigateTo } from "../../app/AppNavigation.Router";
import { resolveCoverUrl } from "../library/BookCover.Mapper";
import { CloseSessionDialog } from "./CloseSessionDialog.UI";
import { saveReaderReturnTarget } from "../reader/ReaderReturnTarget.Store";
import { SessionDetailAnnotationsList } from "./SessionDetailAnnotationsList.UI";
import { SessionDetailHeader } from "./SessionDetailHeader.UI";
import { SessionDetailMetadataEditor } from "./SessionDetailMetadataEditor.UI";
import { SessionDetailTitleEditor } from "./SessionDetailTitleEditor.UI";
import { formatAnnotationCount, formatIso } from "./SessionDetail.Presenter";
import { getSessionDisplayName } from "./SessionDisplayName.Presenter";
import { useSessionDetail } from "./SessionDetail.Controller";

export function SessionDetailPage({ profile, spl, sessionId }: { profile: ConnectionProfile | null; spl: SecondPassClient | null; sessionId: string }) {
  const {
    canLoad, busy, error, session, book, isActive, nameEditor, notesEditor,
    annotations, annoBusy, annoError, closeDialogOpen, openCloseDialog,
    dismissCloseDialog, saveAndClose,
  } = useSessionDetail({ spl, sessionId });
  const progressText = session?.progress?.locationLabel || null;
  const coverSrc = resolveCoverUrl(book?.coverUrl ?? null, profile) ?? null;
  const statusText = session?.status === "active" ? "Active" : "Closed";
  const annoText = formatAnnotationCount(session?.annotationCount ?? null);

  const displayName = getSessionDisplayName(session?.name, session?.id);

  const bookLine = useMemo(() => [], []);
  const canOpenReader = Boolean(book?.id) && book?.canOpen !== false;

  return (
    <section className="panel sessionDetailPage">
      {session ? (
        <SessionDetailTitleEditor
          displayName={displayName}
          isActive={isActive}
          {...nameEditor}
        />
      ) : null}

      {!canLoad ? <p className="muted">Connect to Second Pass Library to view this Reading Session.</p> : null}
      {busy ? <p className="muted">{`Loading${"\u2026"}`}</p> : null}
      {error ? <div className="errorText">{error}</div> : null}

      {session ? (
        <>
          <SessionDetailHeader
            book={book!}
            coverSrc={coverSrc}
            bookLine={bookLine}
            statusText={statusText}
            progressText={progressText}
            annotationText={annoText}
            startedText={formatIso(session.startedAt)}
            updatedText={formatIso(session.updatedAt)}
            closedText={formatIso(session.closedAt)}
            noteContent={(
              <SessionDetailMetadataEditor
                session={session}
                isActive={isActive}
                {...notesEditor}
              />
            )}
            isActive={isActive}
            canOpenReader={canOpenReader}
            onOpenReader={() => {
              if (book?.canOpen === false) return;
              const bookId = String(book?.id ?? "");
              saveReaderReturnTarget(bookId, {
                kind: "sessions",
                label: displayName,
                route: `#/sessions/${encodeURIComponent(sessionId)}`,
                sessionId,
              });
              navigateTo({ kind: "reader", bookId });
            }}
            onCloseSession={openCloseDialog}
            onOpenBookSessions={() => navigateTo({ kind: "sessions", bookId: String(book?.id) })}
          />

          <SessionDetailAnnotationsList
            annotations={annotations}
            annoBusy={annoBusy}
            annoError={annoError}
          />
        </>
      ) : null}

      {closeDialogOpen && session ? (
        <CloseSessionDialog
          initialName={typeof session.name === "string" ? session.name : ""}
          initialNotes={typeof session.notes === "string" ? session.notes : ""}
          onCancel={dismissCloseDialog}
          onSaveAndClose={saveAndClose}
        />
      ) : null}
    </section>
  );
}
