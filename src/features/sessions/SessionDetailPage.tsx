import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { ReadingAnnotationPage, ReadingSessionSummary, SecondPassClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { navigateTo } from "../../app/navigation";
import { resolveCoverUrl } from "../library/coverUtils";
import { CloseSessionDialog, type CloseSessionInput } from "./CloseSessionDialog";
import { saveReaderReturnTarget } from "../reader/readerReturnTarget";
import { SessionDetailAnnotationsList } from "./SessionDetailAnnotationsList";
import { SessionDetailHeader } from "./SessionDetailHeader";
import { SessionDetailMetadataEditor } from "./SessionDetailMetadataEditor";
import { formatAnnotationCount, formatIso, formatProgress, normalizeStatus } from "./sessionDetailDisplay";

export function SessionDetailPage({ profile, spl, sessionId }: { profile: ConnectionProfile | null; spl: SecondPassClient | null; sessionId: string }) {
  const canLoad = Boolean(spl);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ReadingSessionSummary | null>(null);

  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const [annoBusy, setAnnoBusy] = useState(false);
  const [annoError, setAnnoError] = useState<string | null>(null);
  const [annoPage, setAnnoPage] = useState<ReadingAnnotationPage | null>(null);
  const [annoLoadingMore, setAnnoLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!spl) return;
    setBusy(true);
    setError(null);
    try {
      const s = await spl.reading.sessions.get(sessionId);
      setSession(s);
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
      setSession(null);
    } finally {
      setBusy(false);
    }
  }, [sessionId, spl]);

  const loadAnnotations = useCallback(
    async (page = 1) => {
      if (!spl) return;
      setAnnoBusy(true);
      setAnnoError(null);
      try {
        const p = await spl.reading.annotations.list({ sessionId, page });
        setAnnoPage(p);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load annotations.";
        setAnnoError(message);
        setAnnoPage(null);
      } finally {
        setAnnoBusy(false);
      }
    },
    [sessionId, spl],
  );

  useEffect(() => {
    setSession(null);
    setError(null);
    setBusy(false);
    setSaveError(null);
    setCloseDialogOpen(false);
    setAnnoPage(null);
    setAnnoError(null);
    setAnnoBusy(false);
    if (!canLoad) return;
    void load();
    void loadAnnotations(1);
  }, [canLoad, load, loadAnnotations]);

  const isActive = Boolean(session?.is_active);
  const progressText = formatProgress(session?.progression ?? null);
  const coverSrc = resolveCoverUrl(session?.book?.cover_url ?? null, profile) ?? null;
  const statusText = normalizeStatus(typeof session?.status === "string" ? session.status : null, session?.is_active ?? null);
  const annoText = formatAnnotationCount(session?.annotation_count ?? null);

  const headerTitle = session?.book?.title
    ? `Marginalia for ${"\u201C"}${session.book.title}${"\u201D"}`
    : "Marginalia";

  const handleSaveName = useCallback(async () => {
    if (!spl) return;
    if (!session) return;
    if (!isActive) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      await spl.reading.sessions.updateDetails(sessionId, { name: draftName });
      const refreshed = await spl.reading.sessions.get(sessionId);
      setSession(refreshed);
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
      await spl.reading.sessions.updateDetails(sessionId, { notes: draftNotes });
      const refreshed = await spl.reading.sessions.get(sessionId);
      setSession(refreshed);
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
        await spl.reading.sessions.updateDetails(sessionId, payload);
      }
      await spl.reading.sessions.close(sessionId);
      const refreshed = await spl.reading.sessions.get(sessionId);
      setSession(refreshed);
      setDraftName(typeof refreshed.name === "string" ? refreshed.name : "");
      setDraftNotes(typeof refreshed.notes === "string" ? refreshed.notes : "");
      setEditingName(false);
      setEditingNotes(false);
      setCloseDialogOpen(false);
      if (input.afterAction === "sessions") navigateTo({ kind: "sessions" });
    } catch (e) {
      throw e instanceof Error ? e : new Error("Failed to close session.");
    }
  }, [session, sessionId, spl]);

  const handleLoadMoreAnnotations = useCallback(async () => {
    if (annoLoadingMore) return;
    const nextUrl = annoPage?.next ?? null;
    if (!nextUrl) return;
    let nextPage: number | null = null;
    try {
      const u = new URL(nextUrl);
      const raw = u.searchParams.get("page");
      if (raw) {
        const n = Number(raw);
        nextPage = Number.isFinite(n) && n > 0 ? n : null;
      }
    } catch {
      nextPage = null;
    }
    if (!nextPage) return;

    setAnnoLoadingMore(true);
    setAnnoError(null);
    try {
      if (!spl) return;
      const p = await spl.reading.annotations.list({ sessionId, page: nextPage });
      setAnnoPage((prev) => {
        if (!prev) return p;
        return { ...p, results: [...(prev.results ?? []), ...(p.results ?? [])] };
      });
    } catch (e) {
      setAnnoError(e instanceof Error ? e.message : "Failed to load more annotations.");
    } finally {
      setAnnoLoadingMore(false);
    }
  }, [annoLoadingMore, annoPage, sessionId, spl]);

  const bookLine = useMemo(() => {
    const authors = (session?.book?.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
    const seriesName = session?.book?.series?.name ?? null;
    const idx = session?.book?.series_index;
    const series = seriesName ? (idx === null || idx === undefined || idx === "" ? seriesName : `${seriesName} #${idx}`) : null;
    return [authors || null, series || null].filter((item): item is string => Boolean(item));
  }, [session?.book?.authors, session?.book?.series?.name, session?.book?.series_index]);

  const canOpenReader = Boolean(session?.book?.id) && session?.can_open !== false;

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
            coverSrc={coverSrc}
            bookLine={bookLine}
            statusText={statusText}
            progressText={progressText}
            annotationText={annoText}
            isActive={isActive}
            canOpenReader={canOpenReader}
            onOpenReader={() => {
              if (session.can_open === false) return;
              const bookId = String(session.book?.id ?? "");
              saveReaderReturnTarget(bookId, {
                kind: "sessions",
                label: session.name?.trim() ? session.name.trim() : "Session detail",
                route: `#/sessions/${encodeURIComponent(sessionId)}`,
                sessionId,
              });
              navigateTo({ kind: "reader", bookId });
            }}
            onCloseSession={() => setCloseDialogOpen(true)}
            onOpenBookSessions={() => navigateTo({ kind: "sessions", bookId: String(session.book?.id) })}
          />

          <div className="sessionMetaGrid">
            {session.started_at ? <div className="detailRow"><span className="muted">Started:</span> {formatIso(session.started_at)}</div> : null}
            {session.updated_at ? <div className="detailRow"><span className="muted">Updated:</span> {formatIso(session.updated_at)}</div> : null}
            {session.completed_at ? <div className="detailRow"><span className="muted">Completed:</span> {formatIso(session.completed_at)}</div> : null}
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
            annoPage={annoPage}
            annoBusy={annoBusy}
            annoError={annoError}
            annoLoadingMore={annoLoadingMore}
            onLoadMore={() => void handleLoadMoreAnnotations()}
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
