import type { ReadingOpenResponse } from "../../schemas/readingSession";
import type { LibraryBook } from "../../schemas/library";
import type { LocalHighlight } from "./types";
import { createW3CAnnotationFromLocalHighlight } from "./w3cAnnotationAdapter";
import { createServerAnnotationPayloadFromLocalHighlight } from "./readingAnnotationAdapter";
import { useEffect, useMemo, useState } from "react";

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
}) {
  const sessionId = readingOpen?.session?.id ?? null;
  const profileVersion = readingOpen?.profile_version ?? "0.1.0";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const editingHighlight = useMemo(
    () => (editingId ? highlights.find((h) => h.id === editingId) ?? null : null),
    [editingId, highlights],
  );

  useEffect(() => {
    if (!editingId) return;
    if (!editingHighlight) return;
    if (editingHighlight.serverUpdateStatus === "saved") {
      setEditingId(null);
      setNoteDraft("");
    }
  }, [editingId, editingHighlight]);

  return (
    <section className="panel">
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
                  {serverPageInfo.loading ? "Loading…" : "Load more saved annotations"}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {serverPageInfo?.error ? <div className="errorText">{serverPageInfo.error}</div> : null}

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
                    onClick={() => {
                      if (selectedId === h.id) {
                        setExpandedId((prev) => (prev === h.id ? null : h.id));
                      } else {
                        onSelect(h.id);
                        setExpandedId(null);
                      }
                    }}
                    title={selectedId === h.id ? "Click to expand/collapse text" : "Select annotation"}
                  >
                    <span className={`highlightText ${expandedId === h.id ? "highlightTextExpanded" : ""}`}>
                      {h.text}
                    </span>
                  </button>

                  {h.note ? <div className="muted">note: {h.note}</div> : null}

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

                  <div className="muted">
                    status:{" "}
                    {state.kind === "saved" ? (
                      <span className="pill pillOk">{state.label}</span>
                    ) : state.kind === "saving" ? (
                      <span className="pill pillIdle">{state.label}</span>
                    ) : state.kind === "error" ? (
                      <span className="pill pillWarn">{state.label}</span>
                    ) : (
                      <span className="pill pillIdle">{state.label}</span>
                    )}
                  </div>

                  {state.kind === "error" && h.serverSaveError ? <div className="errorText">{h.serverSaveError}</div> : null}
                  {h.serverDeleteStatus === "error" && h.serverDeleteError ? (
                    <div className="errorText">{h.serverDeleteError}</div>
                  ) : null}
                  {h.serverUpdateStatus === "error" && h.serverUpdateError ? (
                    <div className="errorText">{h.serverUpdateError}</div>
                  ) : null}

                  <details className="highlightDetails">
                    <summary className="muted">Details</summary>
                    <div className="mono">cfi: {h.cfiRange}</div>
                    <div className="mono">created: {h.createdAt}</div>
                    {h.serverAnnotationId ? <div className="mono">server id: {h.serverAnnotationId}</div> : null}
                    {h.serverSavedAt ? <div className="mono">server saved: {h.serverSavedAt}</div> : null}
                    {h.serverUpdatedAt ? <div className="mono">server updated: {h.serverUpdatedAt}</div> : null}
                  </details>

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
