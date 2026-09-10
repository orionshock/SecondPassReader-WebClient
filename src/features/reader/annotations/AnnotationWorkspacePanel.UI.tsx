import { useRef, useState } from "react";
import type { CurrentSessionAnnotationViewModel } from "./ReaderAnnotationViewModels.Types";
import { PreviousSessionAnnotationsPanel } from "./PreviousSessionAnnotationsPanel.UI";
import type { PreviousSessionAnnotationGroup } from "../session/previousSession/PreviousSessionViewModels.Presenter";
import { CurrentSessionMetadataEditor } from "./CurrentSessionMetadataEditor.UI";
import { CurrentAnnotationCard } from "./CurrentAnnotationCard.UI";
import { AnnotationWorkspaceTabs, type AnnotationWorkspaceTabKey } from "./AnnotationWorkspaceTabs.UI";
import { useAnnotationWorkspaceFocus, type AnnotationWorkspaceFocusRequest } from "./ReaderAnnotationWorkspaceFocus.Lifecycle";

export function AnnotationWorkspace({
  annotations,
  status,
  error,
  busy,
  canMutateSession = true,
  canMutateAnnotations = canMutateSession,
  currentSessionId,
  currentCfi,
  previousSessionGroups,
  onEnablePreviousSession,
  currentSessionMeta,
  onUpdateCurrentSessionMeta,
  focusRequest,
  onRemoveAnnotation,
  onUpdateHighlight,
  onJumpToCfi,
  onJumpToCfiRange,
}: {
  annotations: CurrentSessionAnnotationViewModel[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  busy: boolean;
  canMutateSession?: boolean;
  canMutateAnnotations?: boolean;
  currentSessionId?: string | null;
  currentCfi?: string | null;
  previousSessionGroups?: PreviousSessionAnnotationGroup[];
  onEnablePreviousSession?: (sessionId: string) => void;
  currentSessionMeta?: { name: string | null; notes: string | null; status: "idle" | "loading" | "ready" | "error"; error: string | null };
  onUpdateCurrentSessionMeta?: (update: { name: string; notes: string }) => Promise<void>;
  focusRequest?: AnnotationWorkspaceFocusRequest | null;
  onRemoveAnnotation: (annotationId: string) => void;
  onUpdateHighlight: (annotationId: string, update: { note: string; color: string }) => Promise<void>;
  onJumpToCfi: (cfi: string) => void;
  onJumpToCfiRange: (cfiRange: string) => void;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<AnnotationWorkspaceTabKey>("current");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string>("");
  const [draftColor, setDraftColor] = useState<string>("yellow");
  const [editStatus, setEditStatus] = useState<"idle" | "saving" | "error">("idle");
  const [editError, setEditError] = useState<string | null>(null);

  useAnnotationWorkspaceFocus({ focusRequest, rootRef, setTab });

  return (
    <section ref={rootRef} className="panel spAnnotationWorkspace">
      <div className="spAnnotationWorkspaceHeader">
        <div className="spAnnotationWorkspaceHeaderTop">
          <h2 className="panelTitle spAnnotationWorkspaceTitle">Annotations</h2>
          <AnnotationWorkspaceTabs tab={tab} onChange={setTab} />
        </div>
        {currentSessionMeta && onUpdateCurrentSessionMeta ? (
          <div className="spAnnotationWorkspaceHeaderMeta">
            <CurrentSessionMetadataEditor
              sessionId={currentSessionId}
              name={currentSessionMeta.name}
              notes={currentSessionMeta.notes}
              loadStatus={currentSessionMeta.status}
              loadError={currentSessionMeta.error}
              readOnly={!canMutateSession}
              busy={busy}
              onSave={onUpdateCurrentSessionMeta}
            />
          </div>
        ) : null}
      </div>

      {tab === "current" ? (
        <div role="tabpanel" className="spAnnotationTabPanel">
          {status === "loading" ? <div className="muted">Loading annotations...</div> : null}
          {status === "error" && error ? <div className="muted">Failed to load annotations: {error}</div> : null}
          {busy ? <div className="muted">Updating annotations...</div> : null}
          {annotations.length === 0 ? <div className="muted">No annotations yet.</div> : null}

          {annotations.length > 0 ? (
            <div className="spAnnotationList" aria-label="Current session annotations">
              {annotations.map((a) => {
                return (
                  <CurrentAnnotationCard
                    key={a.id}
                    annotation={a}
                    busy={busy}
                    readOnly={!canMutateAnnotations}
                    currentCfi={currentCfi}
                    draftColor={draftColor}
                    draftNote={draftNote}
                    editingId={editingId}
                    editError={editError}
                    editStatus={editStatus}
                    onJumpToCfi={onJumpToCfi}
                    onJumpToCfiRange={onJumpToCfiRange}
                    onRemoveAnnotation={onRemoveAnnotation}
                    onUpdateHighlight={onUpdateHighlight}
                    setDraftColor={setDraftColor}
                    setDraftNote={setDraftNote}
                    setEditingId={setEditingId}
                    setEditError={setEditError}
                    setEditStatus={setEditStatus}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div role="tabpanel" className="spAnnotationTabPanel">
          <PreviousSessionAnnotationsPanel
            groups={previousSessionGroups ?? []}
            onEnableInMarginalia={(sessionId) => onEnablePreviousSession?.(sessionId)}
            onJumpToCfi={onJumpToCfi}
            onJumpToCfiRange={onJumpToCfiRange}
          />
        </div>
      )}
    </section>
  );
}
