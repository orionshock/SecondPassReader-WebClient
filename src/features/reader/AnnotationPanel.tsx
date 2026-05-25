import type { ReadingOpenResponse, ReadingSessionSummary } from "../../schemas/readingSession";
import type { LibraryBook } from "../../schemas/library";
import type { LocalHighlight } from "./types";
import { createW3CAnnotationFromLocalHighlight } from "./w3cAnnotationAdapter";
import { createServerAnnotationPayloadFromLocalHighlight } from "./readingAnnotationAdapter";
import { useEffect, useState } from "react";
import { SecondPassApiClient } from "../../api/SecondPassApiClient";
import { DEFAULT_HIGHLIGHT_COLOR, highlightColorLabel, highlightColorToClassName, isHighlightColor } from "./highlightColors";

function getAnnotationStateLabel(h: LocalHighlight): { label: string; kind: "draft" | "saving" | "saved" | "error" } {
  if (h.serverSaveStatus === "saving") return { label: "Saving", kind: "saving" };
  if (h.serverSaveStatus === "saved" || h.serverAnnotationId) return { label: "Saved to session", kind: "saved" };
  if (h.serverSaveStatus === "error") return { label: "Error", kind: "error" };
  return { label: "Draft", kind: "draft" };
}

export function AnnotationPanel({
  highlights,
  selectedId,
  onSelect,
  onRemoveLocal,
  onSaveToSession,
  onDeleteFromSession,
  onUpdateNote,
  serverPageInfo,
  onLoadMoreSavedAnnotations,
  readingOpen,
  book,
  apiReady,
  apiBaseUrl,
  accessToken,
  tokenType,
}: {
  highlights: LocalHighlight[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemoveLocal: (id: string) => void;
  onSaveToSession: (id: string) => void;
  onDeleteFromSession: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  serverPageInfo: {
    count: number;
    loaded: number;
    next: string | null;
    loading: boolean;
    error: string | null;
  } | null;
  onLoadMoreSavedAnnotations: () => void;
  readingOpen: ReadingOpenResponse | null;
  book: LibraryBook;
  apiReady: boolean;
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
}) {
  const sessionId = readingOpen?.session?.id ?? null;
  const profileVersion = readingOpen?.profile_version ?? "0.1.0";
  const devDiagnostics = import.meta.env.DEV;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);

  const [sessionMeta, setSessionMeta] = useState<ReadingSessionSummary | null>(null);
  const [editingSessionName, setEditingSessionName] = useState(false);
  const [editingSessionNotes, setEditingSessionNotes] = useState(false);
  const [sessionNameDraft, setSessionNameDraft] = useState("");
  const [sessionNotesDraft, setSessionNotesDraft] = useState("");
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null);
  const [sessionSaving, setSessionSaving] = useState(false);

  useEffect(() => {
    if (!pendingSaveId) return;
    const h = highlights.find((x) => x.id === pendingSaveId) ?? null;
    if (!h) {
      setPendingSaveId(null);
      return;
    }
    if (h.serverUpdateStatus === "saving") return;
    if (h.serverUpdateStatus === "error") {
      setPendingSaveId(null);
      return;
    }
    // Save completed successfully (ReaderArea clears serverUpdateStatus on success).
    setPendingSaveId(null);
    setEditingId(null);
    setNoteDraft("");
  }, [highlights, pendingSaveId]);

  useEffect(() => {
    const anySession = readingOpen?.session as any;
    if (!sessionId) {
      setSessionMeta(null);
      return;
    }
    const next: ReadingSessionSummary = {
      id: String(sessionId),
      name: typeof anySession?.name === "string" ? anySession.name : null,
      notes: typeof anySession?.notes === "string" ? anySession.notes : null,
      status: typeof anySession?.status === "string" ? anySession.status : null,
      is_active: typeof anySession?.is_active === "boolean" ? anySession.is_active : null,
      updated_at: typeof anySession?.updated_at === "string" ? anySession.updated_at : null,
    };
    setSessionMeta((prev) => (prev?.id === next.id ? { ...prev, ...next } : next));
  }, [readingOpen?.session, sessionId]);

  const canEditSessionMeta = apiReady && Boolean(sessionId) && (sessionMeta?.is_active ?? true) !== false;

  async function saveSessionMeta(patch: { name?: string; notes?: string }) {
    if (!sessionId || !apiBaseUrl || !accessToken) return;
    setSessionSaving(true);
    setSessionSaveError(null);
    try {
      const api = new SecondPassApiClient({ serverBaseUrl: new URL(apiBaseUrl).origin });
      const updated = await api.updateReadingSession({
        apiBaseUrl,
        accessToken,
        tokenType: tokenType ?? "Bearer",
        sessionId,
        payload: patch,
      });
      setSessionMeta(updated);
      setEditingSessionName(false);
      setEditingSessionNotes(false);
    } catch (e) {
      setSessionSaveError(e instanceof Error ? e.message : "Failed to update session.");
    } finally {
      setSessionSaving(false);
    }
  }

  function formatWhen(raw?: string | null): string | null {
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString();
  }

  return (
    <section className="panel readerAnnotationsPanel">
      <div className="panelHeaderRow">
        <h2 className="panelTitle">Annotations</h2>
        {serverPageInfo ? (
          <div className="muted">
            server: {serverPageInfo.loaded} / {serverPageInfo.count}
            {serverPageInfo.next ? (
              <>
                {" "}
                <button
                  type="button"
                  className="button buttonCompact"
                  onClick={onLoadMoreSavedAnnotations}
                  disabled={!apiReady || !sessionId || serverPageInfo.loading}
                  title={!sessionId ? "No active reading session." : undefined}
                >
                  {serverPageInfo.loading ? `Loading${"\u2026"}` : "Load more saved annotations"}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {serverPageInfo?.error ? <div className="errorText">{serverPageInfo.error}</div> : null}
      {sessionSaveError ? <div className="errorText">{sessionSaveError}</div> : null}

      {sessionId ? (
        <div className="readerSessionMeta">
          <div className="readerSessionMetaRow">
            <div className="readerSessionMetaLabel muted">Active session</div>
            <div className="readerSessionMetaValue">
              {!editingSessionName ? (
                <>
                  <span>{(sessionMeta?.name ?? "").trim() || "Unnamed session"}</span>
                  <button
                    type="button"
                    className="button buttonCompact"
                    onClick={() => {
                      if (!canEditSessionMeta) return;
                      setEditingSessionName(true);
                      setSessionNameDraft((sessionMeta?.name ?? "").trim());
                    }}
                    disabled={!canEditSessionMeta}
                    title={!canEditSessionMeta ? "Session is read-only." : "Edit session name"}
                    aria-label="Edit session name"
                  >
                    {"\u270E"}
                  </button>
                </>
              ) : (
                <div className="readerSessionEditRow">
                  <input
                    className="input inputCompact"
                    style={{ width: "32ch" }}
                    value={sessionNameDraft}
                    maxLength={255}
                    onChange={(e) => setSessionNameDraft(e.target.value)}
                    aria-label="Session name"
                  />
                  <button
                    type="button"
                    className="button buttonCompact"
                    disabled={sessionSaving}
                    onClick={() => void saveSessionMeta({ name: sessionNameDraft.trim() })}
                    aria-label="Save session name"
                    title="Save"
                  >
                    {"\u2713"}
                  </button>
                  <button
                    type="button"
                    className="button buttonCompact"
                    disabled={sessionSaving}
                    onClick={() => setEditingSessionName(false)}
                    aria-label="Cancel"
                    title="Cancel"
                  >
                    {"\u2715"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="readerSessionMetaRow">
            <div className="readerSessionMetaLabel muted">Notes</div>
            <div className="readerSessionMetaValue">
              {!editingSessionNotes ? (
                <>
                  <span className={(sessionMeta?.notes ?? "").trim() ? "" : "muted"}>
                    {(sessionMeta?.notes ?? "").trim() || "No notes"}
                  </span>
                  <button
                    type="button"
                    className="button buttonCompact"
                    onClick={() => {
                      if (!canEditSessionMeta) return;
                      setEditingSessionNotes(true);
                      setSessionNotesDraft((sessionMeta?.notes ?? "").trim());
                    }}
                    disabled={!canEditSessionMeta}
                    title={!canEditSessionMeta ? "Session is read-only." : "Edit session notes"}
                    aria-label="Edit session notes"
                  >
                    {"\u270E"}
                  </button>
                </>
              ) : (
                <div className="readerSessionEditBlock">
                  <textarea
                    className="input"
                    cols={40}
                    rows={4}
                    maxLength={500}
                    value={sessionNotesDraft}
                    onChange={(e) => setSessionNotesDraft(e.target.value)}
                    aria-label="Session notes"
                  />
                  <div className="readerSessionEditActions">
                    <span className="muted">{sessionNotesDraft.length}/500</span>
                    <button
                      type="button"
                      className="button buttonCompact"
                      disabled={sessionSaving}
                      onClick={() => void saveSessionMeta({ notes: sessionNotesDraft.trim() })}
                      aria-label="Save session notes"
                      title="Save"
                    >
                      {"\u2713"}
                    </button>
                    <button
                      type="button"
                      className="button buttonCompact"
                      disabled={sessionSaving}
                      onClick={() => setEditingSessionNotes(false)}
                      aria-label="Cancel"
                      title="Cancel"
                    >
                      {"\u2715"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {highlights.length === 0 ? (
        <p className="muted">Select text in the reader to create an annotation.</p>
      ) : (
        <ul className="highlightList">
          {highlights.map((h) => {
            const state = getAnnotationStateLabel(h);
            const isSaved = state.kind === "saved";
            const canSave = apiReady && Boolean(sessionId) && !isSaved && state.kind !== "saving";
            const isDeleting = h.serverDeleteStatus === "deleting";
            const canDelete = apiReady && Boolean(sessionId) && isSaved && Boolean(h.serverAnnotationId) && !isDeleting;
            const isEditing = editingId === h.id;
            const isUpdating = h.serverUpdateStatus === "saving";
            const canEdit = apiReady && Boolean(sessionId) && isSaved && Boolean(h.serverAnnotationId) && !isDeleting && !isUpdating;

            return (
              <li key={h.id} className={`highlightRow ${h.id === selectedId ? "highlightRowSelected" : ""}`}>
                <div className="highlightMain">
                  <button
                    type="button"
                    className="highlightSelect"
                    onClick={() => onSelect(h.id)}
                    title="Select annotation"
                  >
                    {(() => {
                      const token = isHighlightColor(h.color) ? h.color : DEFAULT_HIGHLIGHT_COLOR;
                      const quoteClass = `annoQuote ${highlightColorToClassName(token)}`;
                      return (
                        <>
                          <div className={quoteClass} title={`Highlight ${highlightColorLabel(token)}`}>
                            {h.text}
                          </div>
                          {h.note ? <div className="annoNote">{h.note}</div> : null}
                        </>
                      );
                    })()}
                  </button>

                  {isSaved && isEditing ? (
                    <div className="highlightEditBox">
                      <textarea
                        className="input"
                        rows={3}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Note..."
                      />
                      <div className="highlightEditActions">
                        <button
                          type="button"
                          className="button buttonPrimary buttonCompact"
                          disabled={!canEdit}
                          onClick={() => {
                            if (!editingId) return;
                            setPendingSaveId(editingId);
                            onUpdateNote(editingId, noteDraft);
                          }}
                          aria-label="Save note"
                          title="Save note"
                        >
                          {isUpdating ? "..." : "\u2713"}
                        </button>
                        <button
                          type="button"
                          className="button buttonCompact"
                          onClick={() => {
                            setEditingId(null);
                            setNoteDraft("");
                          }}
                          disabled={isUpdating}
                          aria-label="Cancel"
                          title="Cancel"
                        >
                          {"\u2715"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="annoMeta muted">
                    {state.kind === "saved" ? (
                      <span className="pill pillOk">{state.label}</span>
                    ) : state.kind === "saving" ? (
                      <span className="pill pillIdle">{state.label}</span>
                    ) : state.kind === "error" ? (
                      <span className="pill pillWarn">{state.label}</span>
                    ) : (
                      <span className="pill pillIdle">{state.label}</span>
                    )}
                    {(() => {
                      const when = formatWhen(h.serverUpdatedAt ?? h.serverSavedAt ?? h.createdAt);
                      return when ? <span className="annoMetaWhen">{when}</span> : null;
                    })()}
                  </div>

                  {state.kind === "error" && h.serverSaveError ? <div className="errorText">{h.serverSaveError}</div> : null}
                  {h.serverDeleteStatus === "error" && h.serverDeleteError ? (
                    <div className="errorText">{h.serverDeleteError}</div>
                  ) : null}
                  {h.serverUpdateStatus === "error" && h.serverUpdateError ? (
                    <div className="errorText">{h.serverUpdateError}</div>
                  ) : null}

                  {devDiagnostics ? (
                    <details className="highlightDetails">
                      <summary className="muted">Details (dev)</summary>
                      <div className="mono">cfi: {h.cfiRange}</div>
                      <div className="mono">created: {h.createdAt}</div>
                      {h.serverAnnotationId ? <div className="mono">server id: {h.serverAnnotationId}</div> : null}
                      {h.serverSavedAt ? <div className="mono">server saved: {h.serverSavedAt}</div> : null}
                      {h.serverUpdatedAt ? <div className="mono">server updated: {h.serverUpdatedAt}</div> : null}
                      <details className="highlightDetails">
                        <summary className="muted">Server create payload preview</summary>
                        <pre className="codeBlock">
                          {JSON.stringify(
                            createServerAnnotationPayloadFromLocalHighlight({
                              localHighlight: h,
                              sessionId: sessionId ?? "missing-session",
                              profileVersion,
                            }),
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                      <details className="highlightDetails">
                        <summary className="muted">W3C annotation preview</summary>
                        <pre className="codeBlock">
                          {JSON.stringify(createW3CAnnotationFromLocalHighlight({ localHighlight: h, book }), null, 2)}
                        </pre>
                      </details>
                    </details>
                  ) : null}
                </div>

                <div className="highlightActions">
                  {isSaved ? (
                    <button
                      type="button"
                      className="button buttonCompact"
                      onClick={() => {
                        if (editingId === h.id) {
                          setEditingId(null);
                          setNoteDraft("");
                          return;
                        }
                        setEditingId(h.id);
                        setNoteDraft(h.note ?? "");
                      }}
                      disabled={!canEdit}
                      title={!sessionId ? "No active reading session." : undefined}
                      aria-label={isEditing ? "Cancel edit" : "Edit note"}
                    >
                      {isUpdating ? "..." : isEditing ? "\u2715" : "\u270E"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button buttonPrimary buttonCompact"
                    onClick={() => onSaveToSession(h.id)}
                    disabled={!canSave}
                    title={!sessionId ? "No active reading session." : undefined}
                    aria-label="Save to session"
                  >
                    {"\u{1F4BE}"}
                  </button>
                  <button
                    type="button"
                    className="button buttonDanger buttonCompact"
                    onClick={() => {
                      if (isSaved) {
                        onDeleteFromSession(h.id);
                      } else {
                        onRemoveLocal(h.id);
                      }
                    }}
                    disabled={isSaved ? !canDelete : false}
                    aria-label={isSaved ? "Delete from session" : "Remove draft"}
                    title={isSaved ? "Delete from session" : "Remove draft"}
                  >
                    {isSaved ? (isDeleting ? "..." : "\u{1F5D1}") : "\u2715"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
