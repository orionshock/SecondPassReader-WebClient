import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@secondpass/client";
import type { ReadingAnnotationPage, ReadingSessionSummary } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import { navigateTo } from "../../app/navigation";
import { resolveCoverUrl } from "../library/coverUtils";
import { createSplClientFromProfile } from "../../app/createSplClient";
import { InlineMeta } from "../../components/MetaSeparator";
import { MaterialIcon } from "../../components/MaterialIcon";

function formatIso(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
  } catch {
    return iso;
  }
}

function formatProgress(p?: number | null): string | null {
  if (typeof p !== "number" || !Number.isFinite(p)) return null;
  const clamped = Math.min(1, Math.max(0, p));
  return `${Math.round(clamped * 100)}%`;
}

function normalizeStatus(status?: string | null, isActive?: boolean | null): "active" | "completed" | "archived" | string {
  if (isActive === true) return "active";
  const raw = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (raw === "active" || raw === "completed" || raw === "archived") return raw;
  if (raw) return raw;
  if (isActive === false) return "completed";
  return "active";
}

function formatAnnotationCount(n?: number | null): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const count = Math.max(0, Math.floor(n));
  return count === 1 ? "1 annotation" : `${count} annotations`;
}

function getAnnotationTexts(annotation: unknown): { quote: string | null; note: string | null } {
  const bodies = (annotation as any)?.body;
  if (!Array.isArray(bodies)) return { quote: null, note: null };

  const textBodies: Array<{ purpose: string | null; value: string }> = [];
  for (const b of bodies) {
    if (!b || typeof b !== "object") continue;
    const type = (b as any).type;
    if (typeof type === "string" && type !== "TextualBody") continue;

    const value = (b as any).value;
    if (typeof value !== "string") continue;
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const purposeRaw = (b as any).purpose;
    const purpose = typeof purposeRaw === "string" ? purposeRaw.trim().toLowerCase() : null;
    textBodies.push({ purpose, value: trimmed });
  }

  if (!textBodies.length) return { quote: null, note: null };

  const quote = textBodies.find((tb) => tb.purpose === "describing")?.value ?? null;
  const note = textBodies.find((tb) => tb.purpose === "commenting")?.value ?? null;
  if (quote || note) return { quote, note };

  const rawMotivation = (annotation as any)?.motivation;
  const motivations: string[] = Array.isArray(rawMotivation)
    ? rawMotivation.filter((x): x is string => typeof x === "string")
    : typeof rawMotivation === "string"
      ? [rawMotivation]
      : [];
  const isHighlight = motivations.includes("highlighting");
  const isComment = motivations.includes("commenting");

  // Minimal fallbacks (explicit):
  // - Highlight-only: use first textual body as quote.
  // - Comment-only: if there is only one textual body, treat it as note-only.
  if (isHighlight) return { quote: textBodies[0]?.value ?? null, note: null };
  if (isComment && textBodies.length === 1) return { quote: null, note: textBodies[0]?.value ?? null };

  return { quote: textBodies[0]?.value ?? null, note: null };
}

function getAnnotationDisplay(annotation: unknown): { iconName: string; label: string } {
  const rawMotivation = (annotation as any)?.motivation;
  const motivations: string[] = Array.isArray(rawMotivation)
    ? rawMotivation.filter((x): x is string => typeof x === "string")
    : typeof rawMotivation === "string"
      ? [rawMotivation]
      : [];

  if (motivations.includes("bookmarking")) return { iconName: "bookmark", label: "Bookmark" };
  if (motivations.includes("highlighting")) return { iconName: "border_color", label: "Highlight" };
  if (motivations.includes("commenting")) return { iconName: "chat_bubble", label: "Comment" };
  return { iconName: "edit_note", label: "Annotation" };
}

export function SessionDetailPage({ profile, sessionId }: { profile: ConnectionProfile | null; sessionId: string }) {
  const canLoad = Boolean(profile?.apiBaseUrl && profile?.accessToken);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ReadingSessionSummary | null>(null);

  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const [annoBusy, setAnnoBusy] = useState(false);
  const [annoError, setAnnoError] = useState<string | null>(null);
  const [annoPage, setAnnoPage] = useState<ReadingAnnotationPage | null>(null);
  const [annoLoadingMore, setAnnoLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const spl = createSplClientFromProfile(profile);
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
  }, [profile, sessionId]);

  const loadAnnotations = useCallback(
    async (page = 1) => {
      if (!profile?.apiBaseUrl || !profile.accessToken) return;
      setAnnoBusy(true);
      setAnnoError(null);
      try {
        const spl = createSplClientFromProfile(profile);
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
    [profile, sessionId],
  );

  useEffect(() => {
    setSession(null);
    setError(null);
    setBusy(false);
    setSaveError(null);
    setCloseError(null);
    setAnnoPage(null);
    setAnnoError(null);
    setAnnoBusy(false);
    if (!canLoad) return;
    void load();
    void loadAnnotations(1);
  }, [canLoad, load, loadAnnotations]);

  const isActive = Boolean(session?.is_active);
  const progressText = formatProgress(session?.progression ?? null);
  const coverSrc = resolveCoverUrl(session?.book?.cover_url ?? null, profile);
  const statusText = normalizeStatus(typeof session?.status === "string" ? session.status : null, session?.is_active ?? null);
  const annoText = formatAnnotationCount(session?.annotation_count ?? null);

  const headerTitle = session?.book?.title
    ? `Marginalia for ${"\u201C"}${session.book.title}${"\u201D"}`
    : "Marginalia";

  const handleSaveName = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (!session) return;
    if (!isActive) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.reading.sessions.updateDetails(sessionId, { name: draftName });
      const refreshed = await spl.reading.sessions.get(sessionId);
      setSession(refreshed);
      setEditingName(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save session.");
    } finally {
      setSaveBusy(false);
    }
  }, [draftName, isActive, profile, session, sessionId]);

  const handleSaveNotes = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (!session) return;
    if (!isActive) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.reading.sessions.updateDetails(sessionId, { notes: draftNotes });
      const refreshed = await spl.reading.sessions.get(sessionId);
      setSession(refreshed);
      setEditingNotes(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save session.");
    } finally {
      setSaveBusy(false);
    }
  }, [draftNotes, isActive, profile, session, sessionId]);

  const handleClose = useCallback(async () => {
    if (!profile?.apiBaseUrl || !profile.accessToken) return;
    if (!sessionId) return;
    setCloseBusy(true);
    setCloseError(null);
    setConfirmClose(false);
    try {
      const spl = createSplClientFromProfile(profile);
      await spl.reading.sessions.close(sessionId);
      const refreshed = await spl.reading.sessions.get(sessionId);
      setSession(refreshed);
      setDraftName(typeof refreshed.name === "string" ? refreshed.name : "");
      setDraftNotes(typeof refreshed.notes === "string" ? refreshed.notes : "");
      setEditingName(false);
      setEditingNotes(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to close session.";
      setCloseError(message);
    } finally {
      setCloseBusy(false);
    }
  }, [profile, sessionId]);

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
      const spl = createSplClientFromProfile(profile!);
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
  }, [annoLoadingMore, annoPage, profile, sessionId]);

  const bookLine = useMemo(() => {
    const authors = (session?.book?.authors ?? []).map((a) => a.name).filter(Boolean).join(", ");
    const seriesName = session?.book?.series?.name ?? null;
    const idx = session?.book?.series_index;
    const series = seriesName ? (idx === null || idx === undefined || idx === "" ? seriesName : `${seriesName} #${idx}`) : null;
    return [authors || null, series || null].filter(Boolean);
  }, [session?.book?.authors, session?.book?.series?.name, session?.book?.series_index]);

  const canOpenReader = Boolean(session?.book?.id);

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
          <div className="sessionHeader">
            <div className="sessionCover">
              {coverSrc ? <img className="sessionCoverImg" src={coverSrc} alt={`${session.book?.title ?? "Book"} cover`} loading="lazy" /> : <div className="bookCoverPlaceholderText">No cover</div>}
            </div>
            <div className="sessionHeaderMain">
              <div className="bookTitle">{session.book?.title ?? "Book"}</div>
              {bookLine.length ? <div className="muted"><InlineMeta items={bookLine} /></div> : null}
              <div className="muted">
                <span className="sessionsId">{session.id}</span>
              </div>
              <div className="muted">
                <InlineMeta items={[statusText || null, progressText || null, annoText || null]} />
              </div>
            </div>
            <div className="sessionHeaderActions">
              <button type="button" className="button buttonPrimary" onClick={() => navigateTo({ kind: "reader", bookId: String(session.book?.id ?? "") })} disabled={!canOpenReader}>
                Open reader
              </button>
              {isActive ? (
                <>
                  {!confirmClose ? (
                    <button
                      type="button"
                      className="button buttonCompact"
                      onClick={() => {
                        setCloseError(null);
                        setConfirmClose(true);
                      }}
                      disabled={closeBusy}
                    >
                      Close session
                    </button>
                  ) : (
                    <div className="sessionCloseConfirm" role="group" aria-label="Close session confirmation">
                      <div className="sessionCloseConfirmText muted">
                        Close this session? Name, notes, progress, and annotations become read-only.
                      </div>
                      <div className="sessionCloseConfirmActions">
                        <button type="button" className="button buttonCompact" onClick={() => void handleClose()} disabled={closeBusy}>
                          {closeBusy ? `Closing${"\u2026"}` : "Confirm close"}
                        </button>
                        <button type="button" className="button buttonCompact" onClick={() => setConfirmClose(false)} disabled={closeBusy}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>

          {closeError ? <div className="errorText">{closeError}</div> : null}

          <div className="sessionMetaGrid">
            {session.started_at ? <div className="detailRow"><span className="muted">Started:</span> {formatIso(session.started_at)}</div> : null}
            {session.updated_at ? <div className="detailRow"><span className="muted">Updated:</span> {formatIso(session.updated_at)}</div> : null}
            {session.completed_at ? <div className="detailRow"><span className="muted">Completed:</span> {formatIso(session.completed_at)}</div> : null}
          </div>

          {isActive ? (
            <div className="sessionEdit">
              <div className="sessionInlineEditRow">
                <div className="sessionInlineEditLabel">Name</div>
                {!editingName ? (
                  <div className="sessionInlineEditFieldRow">
                    {session.name && session.name.trim() ? (
                      <div className="sessionInlineEditValue">{session.name}</div>
                    ) : (
                      <div className="sessionInlineEditValue muted">Unnamed session</div>
                    )}
                    <button
                      type="button"
                      className="button buttonCompact sessionInlineEditButton"
                      onClick={() => {
                        setDraftName(typeof session.name === "string" ? session.name : "");
                        setEditingName(true);
                      }}
                      aria-label="Edit session name"
                      title="Edit"
                    >
                      {"\u270E"}
                    </button>
                  </div>
                ) : (
                  <div className="sessionInlineEditFieldRow">
                    <input
                      className="input inputCompact sessionInlineEditInput"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Session name"
                      maxLength={255}
                    />
                    <button type="button" className="button buttonPrimary buttonCompact" onClick={() => void handleSaveName()} disabled={saveBusy}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="button buttonCompact"
                      onClick={() => {
                        setEditingName(false);
                        setDraftName(typeof session.name === "string" ? session.name : "");
                        setSaveError(null);
                      }}
                      disabled={saveBusy}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="sessionInlineEditRow">
                <div className="sessionInlineEditLabel">Notes</div>
                {!editingNotes ? (
                  <div className="sessionInlineEditFieldRow">
                    {session.notes && session.notes.trim() ? (
                      <div className="sessionInlineEditValue">{session.notes}</div>
                    ) : (
                      <div className="sessionInlineEditValue muted">No notes</div>
                    )}
                    <button
                      type="button"
                      className="button buttonCompact sessionInlineEditButton"
                      onClick={() => {
                        setDraftNotes(typeof session.notes === "string" ? session.notes : "");
                        setEditingNotes(true);
                      }}
                      aria-label="Edit session notes"
                      title="Edit"
                    >
                      {"\u270E"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="sessionInlineEditNotesWrap">
                      <textarea
                        className="input sessionInlineEditTextarea"
                        cols={40}
                        rows={4}
                        value={draftNotes}
                        onChange={(e) => setDraftNotes(e.target.value.slice(0, 500))}
                        placeholder={`Notes${"\u2026"}`}
                        maxLength={500}
                      />
                      <div className="sessionInlineEditNotesFooter muted">{draftNotes.length}/500</div>
                    </div>
                    <div className="sessionInlineEditFieldRow">
                      <button type="button" className="button buttonPrimary buttonCompact" onClick={() => void handleSaveNotes()} disabled={saveBusy}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="button buttonCompact"
                        onClick={() => {
                          setEditingNotes(false);
                          setDraftNotes(typeof session.notes === "string" ? session.notes : "");
                          setSaveError(null);
                        }}
                        disabled={saveBusy}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>

              {saveError ? <div className="errorText">{saveError}</div> : null}
            </div>
          ) : (
            <div className="sessionReadOnly">
              <div className="sessionClosedNotice muted">
                This session is closed. Name, notes, and annotations are read-only.
              </div>
              {session.name ? (
                <div className="detailRow">
                  <span className="muted">Name:</span> {session.name}
                </div>
              ) : null}
              {session.notes ? (
                <div className="detailRow">
                  <span className="muted">Notes:</span> {session.notes}
                </div>
              ) : null}
            </div>
          )}

          <div className="sessionAnnotations">
            <div className="panelHeaderRow" style={{ marginTop: 10 }}>
              <div className="panelTitle" style={{ margin: 0 }}>
                Annotations
              </div>
              {annoPage ? <div className="muted">{annoPage.count ?? 0} total</div> : null}
            </div>

            {annoError ? <div className="errorText">{annoError}</div> : null}
            {annoBusy ? <div className="muted">{`Loading${"\u2026"}`}</div> : null}

            {annoPage?.results?.length ? (
              <div className="sessionAnnoList">
                {annoPage.results.map((a) => {
                  const { iconName, label } = getAnnotationDisplay(a);
                  const updated = (a.updated_at as any) || (a.modified as any) || (a.created_at as any) || (a.created as any);
                  const when = typeof updated === "string" ? formatIso(updated) : null;
                  const { quote, note } = getAnnotationTexts(a);
                  const metaBits = [when ? when : null].filter(Boolean);
                  return (
                    <div
                      key={a.id}
                      className="sessionAnnoRow"
                    >
                      <div className="sessionAnnoIcon" aria-hidden="true" title={label}>
                        <MaterialIcon name={iconName} />
                      </div>
                      <div className="sessionAnnoMain">
                        {quote ? (
                          <div className="sessionAnnoQuote">{quote}</div>
                        ) : null}
                        {note ? (
                          <div className="sessionAnnoNote">{note}</div>
                        ) : !quote ? (
                          <div className="sessionAnnoNote">{label}</div>
                        ) : null}
                        {metaBits.length ? (
                          <div className="sessionAnnoMeta muted">
                            <InlineMeta items={metaBits} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : !annoBusy ? (
              <div className="muted">No annotations yet.</div>
            ) : null}

            {annoPage?.next ? (
              <div style={{ marginTop: 10 }}>
                <button type="button" className="button buttonCompact" onClick={() => void handleLoadMoreAnnotations()} disabled={annoLoadingMore}>
                  {annoLoadingMore ? `Loading${"\u2026"}` : "Load more"}
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
