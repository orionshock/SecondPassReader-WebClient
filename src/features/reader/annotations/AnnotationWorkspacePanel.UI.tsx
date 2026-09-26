import { useMemo, useRef, useState } from "react";
import type { CurrentSessionAnnotationViewModel } from "./ReaderAnnotationViewModels.Types";
import { PreviousSessionAnnotationsPanel } from "./PreviousSessionAnnotationsPanel.UI";
import type { PreviousSessionAnnotationGroup } from "../session/previousSession/PreviousSessionViewModels.Presenter";
import { CurrentSessionMetadataEditor } from "./CurrentSessionMetadataEditor.UI";
import { CurrentAnnotationCard } from "./CurrentAnnotationCard.UI";
import { AnnotationWorkspaceTabs, type AnnotationWorkspaceTabKey } from "./AnnotationWorkspaceTabs.UI";
import { useAnnotationWorkspaceFocus, type AnnotationWorkspaceFocusRequest } from "./ReaderAnnotationWorkspaceFocus.Lifecycle";
import { useCurrentAnnotationEditingController } from "./CurrentAnnotationEditing.Controller";
import {
  sortReaderAnnotations,
  type ReaderAnnotationSortMode,
} from "./ReaderAnnotationSort.Policy";

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
  const [sortMode, setSortMode] = useState<ReaderAnnotationSortMode>("created");
  const sortedAnnotations = useMemo(
    () => sortReaderAnnotations(annotations, sortMode),
    [annotations, sortMode],
  );
  const sortedPreviousSessionGroups = useMemo(
    () => (previousSessionGroups ?? []).map((group) => ({
      ...group,
      items: group.items ? sortReaderAnnotations(group.items, sortMode) : undefined,
    })),
    [previousSessionGroups, sortMode],
  );
  const currentHighlights = useMemo(
    () => annotations.flatMap((annotation) => "cfiRange" in annotation
      ? [{ clientId: annotation.clientId, annotationId: annotation.id }]
      : []),
    [annotations],
  );
  const editing = useCurrentAnnotationEditingController({
    currentHighlights,
    onUpdateHighlight,
  });

  useAnnotationWorkspaceFocus({ focusRequest, rootRef, setTab });

  return (
    <section ref={rootRef} className="panel spAnnotationWorkspace">
      <div className="spAnnotationWorkspaceHeader">
        <div className="spAnnotationWorkspaceHeaderTop">
          <h2 className="panelTitle spAnnotationWorkspaceTitle">Annotations</h2>
          <AnnotationWorkspaceTabs tab={tab} onChange={setTab} />
          <label className="spAnnotationSortControl">
            <span>Sort</span>
            <select
              className="input inputCompact"
              aria-label="Sort annotations"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as ReaderAnnotationSortMode)}
            >
              <option value="updated">Last updated</option>
              <option value="created">Created</option>
              <option value="location">Location</option>
            </select>
          </label>
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
        <div id="annotation-current-panel" role="tabpanel" aria-labelledby="annotation-current-tab" className="spAnnotationTabPanel" tabIndex={0}>
          {status === "loading" ? <div className="muted">Loading annotations...</div> : null}
          {status === "error" && error ? <div className="muted">{error}</div> : null}
          {busy ? <div className="muted">Saving changes...</div> : null}
          {annotations.length === 0 ? <div className="muted">No annotations in this Reading Session.</div> : null}

          {annotations.length > 0 ? (
            <div className="spAnnotationList" aria-label="Current Reading Session annotations">
              {sortedAnnotations.map((a) => {
                return (
                  <CurrentAnnotationCard
                    key={a.id}
                    annotation={a}
                    busy={busy}
                    readOnly={!canMutateAnnotations}
                    currentCfi={currentCfi}
                    editing={editing.state}
                    onJumpToCfi={onJumpToCfi}
                    onJumpToCfiRange={onJumpToCfiRange}
                    onRemoveAnnotation={onRemoveAnnotation}
                    onBeginEdit={editing.begin}
                    onCancelEdit={editing.cancel}
                    onChangeDraftColor={editing.changeColor}
                    onChangeDraftNote={editing.changeNote}
                    onSaveEdit={editing.save}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div id="annotation-previous-panel" role="tabpanel" aria-labelledby="annotation-previous-tab" className="spAnnotationTabPanel" tabIndex={0}>
          <PreviousSessionAnnotationsPanel
            groups={sortedPreviousSessionGroups}
            onEnableInMarginalia={(sessionId) => onEnablePreviousSession?.(sessionId)}
            onJumpToCfi={onJumpToCfi}
            onJumpToCfiRange={onJumpToCfiRange}
          />
        </div>
      )}
    </section>
  );
}
