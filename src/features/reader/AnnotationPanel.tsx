import type { ReadingOpenResponse, ReadingSessionSummary } from "@secondpass/client";
import type { LocalHighlight } from "./types";
import { useEffect, useState } from "react";
import { createSecondPassClient } from "@secondpass/client";
import {
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  highlightColorLabel,
  highlightColorToClassName,
  isHighlightColor,
  type HighlightColor,
} from "./highlightColors";

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
  onUpdateNote: (id: string, note: string, color?: HighlightColor) => void;
  serverPageInfo: {
    count: number;
    loaded: number;
    next: string | null;
    loading: boolean;
    error: string | null;
  } | null;
  onLoadMoreSavedAnnotations: () => void;
  readingOpen: ReadingOpenResponse | null;
  apiReady: boolean;
  apiBaseUrl?: string;
  accessToken?: string;
  tokenType?: string;
}) {
  const sessionId = readingOpen?.session?.id ?? null;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);
  const [editColorDraft, setEditColorDraft] = useState<HighlightColor>(DEFAULT_HIGHLIGHT_COLOR);

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
      const spl = createSecondPassClient({ apiBaseUrl, accessToken, tokenType: tokenType ?? "Bearer" });
      const updated = await spl.reading.sessions.update(sessionId, patch);
      setSessionMeta(updated);
      setEditingSessionName(false);
      setEditingSessionNotes(false);
    } catch (e) {
      setSessionSaveError(e instanceof Error ? e.message : "Failed to update session.");
    } finally {
      setSessionSaving(false);
    }
  }

  function truncateOneLine(text: string, max: number): string {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(0, max - 1))}\u2026`;
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
            <div className="readerSessionMetaLabel muted">Session Name:</div>
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
            <div className="readerSessionMetaLabel muted">Notes:</div>
            <div className="readerSessionMetaValue">
              {!editingSessionNotes ? (
                <>
                  {(() => {
                    const raw = (sessionMeta?.notes ?? "").trim();
                    const display = raw ? truncateOneLine(raw, 64) : "No notes";
                    return (
                      <span className={raw ? "" : "muted"} title={raw || undefined}>
                        {display}
                      </span>
                    );
                  })()}
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
                <div className="readerSessionEditRow">
                  <input
                    className="input inputCompact"
                    style={{ width: "64ch" }}
                    value={sessionNotesDraft}
                    maxLength={500}
                    onChange={(e) => setSessionNotesDraft(e.target.value)}
                    aria-label="Session notes"
                  />
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
                      <div className="highlightEditActionsRow">
                        <div className="highlightEditButtons">
                          <button
                            type="button"
                            className="button buttonPrimary buttonCompact"
                            disabled={!canEdit}
                            onClick={() => {
                              if (!editingId) return;
                              setPendingSaveId(editingId);
                              onUpdateNote(editingId, noteDraft, editColorDraft);
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
                        <div className="selectionSwatches" aria-label="Highlight color">
                          {HIGHLIGHT_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              className={`selectionSwatch ${highlightColorToClassName(c)} ${
                                c === editColorDraft ? "selectionSwatchActive" : ""
                              }`}
                              onClick={() => setEditColorDraft(c)}
                              title={`Highlight ${highlightColorLabel(c)}`}
                              aria-label={`Highlight ${highlightColorLabel(c)}`}
                            />
                          ))}
                        </div>
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
                        const token = isHighlightColor(h.color) ? h.color : DEFAULT_HIGHLIGHT_COLOR;
                        setEditColorDraft(token);
                      }}
                      disabled={!canEdit}
                      title={!sessionId ? "No active reading session." : undefined}
                      aria-label={isEditing ? "Cancel edit" : "Edit note"}
                    >
                      {isUpdating ? "..." : isEditing ? "\u2715" : "\u270E"}
                    </button>
                  ) : null}
                  {state.kind === "error" && !isSaved ? (
                    <button
                      type="button"
                      className="button buttonPrimary buttonCompact"
                      onClick={() => onSaveToSession(h.id)}
                      disabled={!apiReady || !sessionId}
                      title={!sessionId ? "No active reading session." : "Retry save"}
                      aria-label="Retry save"
                    >
                      Retry
                    </button>
                  ) : null}
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
                    disabled={isSaved ? !canDelete : state.kind === "saving"}
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
