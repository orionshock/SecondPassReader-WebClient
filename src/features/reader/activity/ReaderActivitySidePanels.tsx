import type { ReactNode } from "react";
import { AnnotationWorkspace } from "../annotations/AnnotationWorkspace";
import { ReaderImportDrawer } from "../imports/ReaderImportDrawer";
import type { useReaderImportJob } from "../imports/useReaderImportJob";
import type { ReaderActivityRenderState, ReaderActivityWorkspaceFocusRequest } from "./readerActivityTypes";

export function ReaderActivitySidePanels({
  importDrawerInLayout,
  shell,
  annotations,
  currentCfi,
  workspaceFocusRequest,
  onJumpToCfi,
  onJumpToCfiRange,
  readerImport,
  onClearImport,
  onCloseImport,
  onSelectImportRow,
  onSkipImportRow,
}: {
  importDrawerInLayout: boolean;
  shell: ReactNode;
  annotations: ReaderActivityRenderState["annotations"];
  currentCfi?: string | null;
  workspaceFocusRequest: ReaderActivityWorkspaceFocusRequest | null;
  onJumpToCfi: (cfi: string) => void;
  onJumpToCfiRange: (cfiRange: string) => void;
  readerImport: ReturnType<typeof useReaderImportJob>;
  onClearImport: () => void;
  onCloseImport: () => void;
  onSelectImportRow: (rowId: string) => void;
  onSkipImportRow: (rowId: string) => void;
}) {
  return (
    <div className={`spReaderContentFrame${importDrawerInLayout ? " spReaderContentFrameImportOpen" : ""}`}>
      <div className="spReaderLayout">
        <div className="spReaderViewportRegion">{shell}</div>
        <div className="spReaderAnnotationsRegion">
          <AnnotationWorkspace
            annotations={annotations.items}
            status={annotations.status}
            error={annotations.error}
            busy={annotations.busy}
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

      <ReaderImportDrawer
        open={readerImport.drawerOpen}
        job={readerImport.job}
        counts={readerImport.counts}
        onClose={onCloseImport}
        onClear={onClearImport}
        onActivateRow={onSelectImportRow}
        onSkipRow={onSkipImportRow}
        onUnskipRow={readerImport.unskipRow}
      />
    </div>
  );
}
