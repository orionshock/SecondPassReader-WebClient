import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { AnnotationWorkspace } from "../annotations/AnnotationWorkspacePanel.UI";
import type { useReaderImportJob } from "../imports/ReaderImportJob.Controller";
import type { ReaderActivityRenderState, ReaderActivityWorkspaceFocusRequest } from "./ReaderActivity.Types";
import type { ReaderWidth } from "../../../storage/ReaderSettings.Store";

const ReaderImportDrawer = lazy(async () => {
  const module = await import("../imports/ReaderImportDrawer.UI");
  return { default: module.ReaderImportDrawer };
});

export function ReaderActivitySidePanels({
  importDrawerInLayout,
  shell,
  annotations,
  canMutateSession,
  canMutateAnnotations,
  currentSessionId,
  currentCfi,
  workspaceFocusRequest,
  onJumpToCfi,
  onJumpToCfiRange,
  readerImport,
  readerWidth,
  onClearImport,
  onCloseImport,
  onSelectImportRow,
  onMarkImportRowManuallyCompleted,
  onSkipImportRow,
}: {
  importDrawerInLayout: boolean;
  shell: ReactNode;
  annotations: ReaderActivityRenderState["annotations"];
  canMutateSession: boolean;
  canMutateAnnotations: boolean;
  currentSessionId?: string | null;
  currentCfi?: string | null;
  workspaceFocusRequest: ReaderActivityWorkspaceFocusRequest | null;
  onJumpToCfi: (cfi: string) => void;
  onJumpToCfiRange: (cfiRange: string) => void;
  readerImport: ReturnType<typeof useReaderImportJob>;
  readerWidth: ReaderWidth;
  onClearImport: () => void;
  onCloseImport: () => void;
  onSelectImportRow: (rowId: string) => void;
  onMarkImportRowManuallyCompleted: (rowId: string) => void;
  onSkipImportRow: (rowId: string) => void;
}) {
  const importDrawerOpen = Boolean(readerImport.drawerOpen && readerImport.job);
  const [importDrawerRequested, setImportDrawerRequested] = useState(importDrawerOpen);

  useEffect(() => {
    if (importDrawerOpen) setImportDrawerRequested(true);
  }, [importDrawerOpen]);

  return (
    <div className={`spReaderContentFrame${importDrawerInLayout ? " spReaderContentFrameImportOpen" : ""}`}>
      <div className="spReaderLayout">
        <div className="spReaderViewportRegion" data-reader-width={readerWidth}>{shell}</div>
        <div className="spReaderAnnotationsRegion">
          <AnnotationWorkspace
            annotations={annotations.items}
            status={annotations.status}
            error={annotations.error}
            busy={annotations.busy}
            canMutateSession={canMutateSession}
            canMutateAnnotations={canMutateAnnotations}
            currentSessionId={currentSessionId}
            currentCfi={currentCfi ?? null}
            previousSessionGroups={annotations.previousSessionGroups}
            onEnablePreviousSession={annotations.enablePreviousSession}
            currentSessionMeta={annotations.currentSessionMeta}
            onUpdateCurrentSessionMeta={annotations.updateCurrentSessionMeta}
            focusRequest={workspaceFocusRequest}
            onRemoveAnnotation={(annotationId) => {
              void annotations.removeById(annotationId);
            }}
            onUpdateHighlight={(annotationId, update) => annotations.updateHighlight(annotationId, update)}
            onJumpToCfi={onJumpToCfi}
            onJumpToCfiRange={onJumpToCfiRange}
          />
        </div>
      </div>

      {importDrawerOpen || importDrawerRequested ? (
        <Suspense fallback={importDrawerOpen ? <ReaderImportDrawerFallback onClose={onCloseImport} /> : null}>
          <ReaderImportDrawer
            open={readerImport.drawerOpen}
            job={readerImport.job}
            counts={readerImport.counts}
            onClose={onCloseImport}
            onClear={onClearImport}
            onActivateRow={onSelectImportRow}
            onMarkManuallyCompleted={onMarkImportRowManuallyCompleted}
            onSkipRow={onSkipImportRow}
            onUndoManualCompletion={readerImport.undoManualCompletion}
            onUnskipRow={readerImport.unskipRow}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function ReaderImportDrawerFallback({ onClose }: { onClose: () => void }) {
  return (
    <aside
      className="spReaderImportDrawer"
      aria-labelledby="sp-reader-import-drawer-loading-title"
    >
      <div className="spReaderImportDrawerHeader">
        <div className="spReaderImportDrawerTitleRow">
          <h2 id="sp-reader-import-drawer-loading-title" className="spReaderImportDrawerTitle">
            Import Marginalia
          </h2>
          <button type="button" className="button buttonCompact" onClick={onClose}>Hide</button>
        </div>
        <p className="muted">{`Loading import review${"\u2026"}`}</p>
      </div>
    </aside>
  );
}
