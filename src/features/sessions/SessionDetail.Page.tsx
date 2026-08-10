import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { MarginaliaAnnotation, MarginaliaSessionDetail, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/ConnectionProfiles.Store";
import { navigateTo } from "../../app/AppNavigation.Router";
import { resolveCoverUrl } from "../library/BookCover.Mapper";
import { CloseSessionDialog, type CloseSessionInput } from "./CloseSession.Dialog";
import { saveReaderReturnTarget } from "../reader/ReaderReturnTarget.Store";
import { SessionDetailAnnotationsList } from "./SessionDetailAnnotations.List";
import { SessionDetailHeader } from "./SessionDetail.Header";
import { SessionDetailMetadataEditor } from "./SessionDetailMetadata.Editor";
import { formatAnnotationCount, formatIso } from "./SessionDetail.Presenter";

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
      const message =
        e instanceof ApiError && (e.kind === "unauthorized" || e.kind === "forbidden")
          ? "Could not load session. Your device token may be revoked or not allowed to access reading data."
          : e instanceof ApiError && e.status === 404
            ? "Session not found or not accessible."
            : e instanceof Error
              ? e.message
              : "Failed to load session.";
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
        const message = e instanceof Error ? e.message : "Failed to load annotations.";
        setAnnoError(message);
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
  const statusText = session?.status ?? "";
  const annoText = formatAnnotationCount(session?.annotationCount ?? null);

  const headerTitle = book?.title
    ? `Marginalia for ${"\u201C"}${book.title}${"\u201D"}`
    : "Marginalia";

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
      setSaveError(e instanceof Error ? e.message : "Failed to save session.");
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
      setSaveError(e instanceof Error ? e.message : "Failed to save session.");
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
      <div className="panelHeaderRow">
        <h2 className="panelTitle" style={{ margin: 0 }}>
          {headerTitle}
        </h2>
      </div>

      {!canLoad ? <p className="muted">Select a verified profile first.</p> : null}
      {busy ? <p className="muted">{`Loading${"\u2026"}`}</p> : null}
      {error ? <div className="errorText">{error}</div> : null}

      {session ? (
        <>
          <SessionDetailHeader
            session={session}
            book={book!}
            coverSrc={coverSrc}
            bookLine={bookLine}
            statusText={statusText}
            progressText={progressText}
            annotationText={annoText}
            isActive={isActive}
            canOpenReader={canOpenReader}
            onOpenReader={() => {
              if (book?.canOpen === false) return;
              const bookId = String(book?.id ?? "");
              saveReaderReturnTarget(bookId, {
                kind: "sessions",
                label: session.name?.trim() ? session.name.trim() : "Session detail",
                route: `#/sessions/${encodeURIComponent(sessionId)}`,
                sessionId,
              });
              navigateTo({ kind: "reader", bookId });
            }}
            onCloseSession={() => setCloseDialogOpen(true)}
            onOpenBookSessions={() => navigateTo({ kind: "sessions", bookId: String(book?.id) })}
          />

          <div className="sessionMetaGrid">
            {session.startedAt ? <div className="detailRow"><span className="muted">Started:</span> {formatIso(session.startedAt)}</div> : null}
            {session.updatedAt ? <div className="detailRow"><span className="muted">Updated:</span> {formatIso(session.updatedAt)}</div> : null}
            {session.closedAt ? <div className="detailRow"><span className="muted">Closed:</span> {formatIso(session.closedAt)}</div> : null}
          </div>

          <SessionDetailMetadataEditor
            session={session}
            isActive={isActive}
            draftName={draftName}
            setDraftName={setDraftName}
            draftNotes={draftNotes}
            setDraftNotes={setDraftNotes}
            editingName={editingName}
            setEditingName={setEditingName}
            editingNotes={editingNotes}
            setEditingNotes={setEditingNotes}
            saveBusy={saveBusy}
            saveError={saveError}
            clearSaveError={() => setSaveError(null)}
            onSaveName={() => void handleSaveName()}
            onSaveNotes={() => void handleSaveNotes()}
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
