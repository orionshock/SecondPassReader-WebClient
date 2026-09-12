import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { MarginaliaAnnotation, MarginaliaSessionDetail, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { navigateTo } from "../../app/AppNavigation.Router";
import { resolveCoverUrl } from "../library/BookCover.Mapper";
import { CloseSessionDialog, type CloseSessionInput } from "./CloseSessionDialog.UI";
import { saveReaderReturnTarget } from "../reader/ReaderReturnTarget.Store";
import { SessionDetailAnnotationsList } from "./SessionDetailAnnotationsList.UI";
import { SessionDetailHeader } from "./SessionDetailHeader.UI";
import { SessionDetailMetadataEditor } from "./SessionDetailMetadataEditor.UI";
import { SessionDetailTitleEditor } from "./SessionDetailTitleEditor.UI";
import { formatAnnotationCount, formatIso } from "./SessionDetail.Presenter";
import { getSessionDisplayName } from "./SessionDisplayName.Presenter";
import { debugWarn } from "../../lib/debug/DebugLogger.Diagnostics";

export function SessionDetailPage({ profile, spl, sessionId }: { profile: ConnectionProfile | null; spl: SecondPassClient | null; sessionId: string }) {
  const canLoad = Boolean(spl);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<MarginaliaSessionDetail | null>(null);
  const session = detail?.session ?? null;
  const book = detail?.context.book ?? null;

  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const [annoBusy, setAnnoBusy] = useState(false);
  const [annoError, setAnnoError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<MarginaliaAnnotation[] | null>(null);

  const load = useCallback(async () => {
    if (!spl) return;
    setBusy(true);
    setError(null);
    try {
      const response = await spl.marginalia.sessions.get(sessionId);
      const s = response.session;
      setDetail(response);
      setDraftName(typeof s.name === "string" ? s.name : "");
      setDraftNotes(typeof s.notes === "string" ? s.notes : "");
      setEditingName(false);
      setEditingNotes(false);
    } catch (e) {
      debugWarn("reader", "Reading Session detail could not be loaded", {
        sessionId,
        error: e,
      });
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "This connection cannot access the Reading Session. Open Settings to repair or review the connection."
          : e instanceof ApiError && e.status === 404
            ? "This Reading Session is unavailable. It may have been removed, or you may not have access."
            : "Couldn't load the Reading Session. Reload the page to try again.";
      setError(message);
      setDetail(null);
    } finally {
      setBusy(false);
    }
  }, [sessionId, spl]);

  const loadAnnotations = useCallback(
    async () => {
      if (!spl) return;
      setAnnoBusy(true);
      setAnnoError(null);
      try {
        const response = await spl.marginalia.sessions.getAnnotations(sessionId);
        setAnnotations(response.annotations);
      } catch (e) {
        debugWarn("reader", "Reading Session annotations could not be loaded", {
          sessionId,
          error: e,
        });
        setAnnoError("Couldn't load annotations. Reload the page to try again.");
        setAnnotations(null);
      } finally {
        setAnnoBusy(false);
      }
    },
    [sessionId, spl],
  );

  useEffect(() => {
    setDetail(null);
    setError(null);
    setBusy(false);
    setSaveError(null);
    setCloseDialogOpen(false);
    setAnnotations(null);
    setAnnoError(null);
    setAnnoBusy(false);
    if (!canLoad) return;
    void load();
    void loadAnnotations();
  }, [canLoad, load, loadAnnotations]);

  const isActive = session?.status === "active";
  const progressText = session?.progress?.locationLabel || null;
  const coverSrc = resolveCoverUrl(book?.coverUrl ?? null, profile) ?? null;
  const statusText = session?.status === "active" ? "Active" : "Closed";
  const annoText = formatAnnotationCount(session?.annotationCount ?? null);

  const displayName = getSessionDisplayName(session?.name, session?.id);

  const handleSaveName = useCallback(async () => {
    if (!spl) return;
    if (!session) return;
    if (!isActive) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      const refreshed = await spl.marginalia.sessions.update(sessionId, { name: draftName });
      setDetail(refreshed);
      setEditingName(false);
    } catch (e) {
      debugWarn("reader", "Reading Session name was not saved", {
        sessionId,
        error: e,
      });
      setSaveError("Couldn't save the Reading Session details. Try again.");
    } finally {
      setSaveBusy(false);
    }
  }, [draftName, isActive, session, sessionId, spl]);

  const handleSaveNotes = useCallback(async () => {
    if (!spl) return;
    if (!session) return;
    if (!isActive) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      const refreshed = await spl.marginalia.sessions.update(sessionId, { notes: draftNotes });
      setDetail(refreshed);
      setEditingNotes(false);
    } catch (e) {
      debugWarn("reader", "Reading Session notes were not saved", {
        sessionId,
        error: e,
      });
      setSaveError("Couldn't save the Reading Session details. Try again.");
    } finally {
      setSaveBusy(false);
    }
  }, [draftNotes, isActive, session, sessionId, spl]);

  const handleSaveAndClose = useCallback(async (input: CloseSessionInput) => {
    if (!spl) return;
    if (!sessionId) return;
    if (!session) return;

    try {
      const savedName = typeof session.name === "string" ? session.name.trim() : "";
      const savedNotes = typeof session.notes === "string" ? session.notes : "";
      const payload: { name?: string; notes?: string } = {};
      if (input.name !== savedName) payload.name = input.name;
      if (input.notes !== savedNotes) payload.notes = input.notes;
      if (Object.keys(payload).length > 0) {
        await spl.marginalia.sessions.update(sessionId, payload);
      }
      const refreshed = await spl.marginalia.sessions.close(sessionId);
      setDetail(refreshed);
      setDraftName(refreshed.session.name);
      setDraftNotes(refreshed.session.notes);
      setEditingName(false);
      setEditingNotes(false);
      setCloseDialogOpen(false);
      if (input.afterAction === "sessions") navigateTo({ kind: "sessions" });
    } catch (e) {
      throw e instanceof Error ? e : new Error("Failed to close session.");
    }
  }, [session, sessionId, spl]);

  const bookLine = useMemo(() => [], []);
  const canOpenReader = Boolean(book?.id) && book?.canOpen !== false;

  return (
    <section className="panel sessionDetailPage">
      {session ? (
        <SessionDetailTitleEditor
          displayName={displayName}
          savedName={typeof session.name === "string" ? session.name : ""}
          isActive={isActive}
          draftName={draftName}
          setDraftName={setDraftName}
          editingName={editingName}
          setEditingName={setEditingName}
          saveBusy={saveBusy}
          saveError={saveError}
          clearSaveError={() => setSaveError(null)}
          onSaveName={() => void handleSaveName()}
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
                draftNotes={draftNotes}
                setDraftNotes={setDraftNotes}
                editingNotes={editingNotes}
                setEditingNotes={setEditingNotes}
                saveBusy={saveBusy}
                saveError={saveError}
                clearSaveError={() => setSaveError(null)}
                onSaveNotes={() => void handleSaveNotes()}
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
            onCloseSession={() => setCloseDialogOpen(true)}
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
          onCancel={() => setCloseDialogOpen(false)}
          onSaveAndClose={handleSaveAndClose}
        />
      ) : null}
    </section>
  );
}
