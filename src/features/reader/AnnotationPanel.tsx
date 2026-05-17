import type { ReadingOpenResponse } from "../../schemas/readingSession";
import type { LibraryBook } from "../../schemas/library";
import type { LocalHighlight } from "./types";
import { createW3CAnnotationFromLocalHighlight } from "./w3cAnnotationAdapter";
import { createServerAnnotationPayloadFromLocalHighlight } from "./readingAnnotationAdapter";

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
  readingOpen: ReadingOpenResponse | null;
  book: LibraryBook;
  apiReady: boolean;
}) {
  const sessionId = readingOpen?.session?.id ?? null;
  const profileVersion = readingOpen?.profile_version ?? "0.1.0";

  return (
    <section className="panel">
      <h2 className="panelTitle">Annotations</h2>

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

            return (
              <li key={h.id} className={`highlightRow ${h.id === selectedId ? "highlightRowSelected" : ""}`}>
                <div className="highlightMain">
                  <button
                    type="button"
                    className="highlightSelect"
                    onClick={() => onSelect(h.id)}
                    title="Select annotation"
                  >
                    <span className="highlightText">{h.text}</span>
                  </button>

                  {h.note ? <div className="muted">note: {h.note}</div> : null}

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

                  <details className="highlightDetails">
                    <summary className="muted">Details</summary>
                    <div className="mono">cfi: {h.cfiRange}</div>
                    <div className="mono">created: {h.createdAt}</div>
                    {h.serverAnnotationId ? <div className="mono">server id: {h.serverAnnotationId}</div> : null}
                    {h.serverSavedAt ? <div className="mono">server saved: {h.serverSavedAt}</div> : null}
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
                  <button
                    type="button"
                    className="button buttonPrimary buttonCompact"
                    onClick={() => onSaveToSession(h.id)}
                    disabled={!canSave}
                    title={!sessionId ? "No active reading session." : undefined}
                  >
                    Save to session
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
                  >
                    {isSaved ? (isDeleting ? "Deleting…" : "Delete from session") : "Remove draft"}
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
