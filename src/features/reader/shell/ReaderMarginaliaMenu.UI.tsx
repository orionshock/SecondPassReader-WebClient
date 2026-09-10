import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MaterialIcon } from "../../../components/MaterialIcon.UI";
import { InlineMeta } from "../../../components/Metadata.UI";

export type MarginaliaLayerSummary = {
  sessionId: string;
  label: string;
  labelParts?: string[];
  highlightCount: number;
  status?: "idle" | "loading" | "ready" | "error";
  error?: string;
};

export function MarginaliaMenu(props: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  listStatus?: "idle" | "loading" | "ready" | "error";
  listError?: string | null;
  previousLayers: MarginaliaLayerSummary[];
  selectedPreviousSessionIds: Set<string>;
  onTogglePreviousSession: (sessionId: string) => void;
  onCloseSession?: () => void;
  importJobActive?: boolean;
  onImportMarginalia?: () => void;
  onOpenImport?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ offsetX: number; placement: "above" | "below" }>({
    offsetX: 0,
    placement: "below",
  });

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onClose, props.open]);

  useLayoutEffect(() => {
    if (!props.open) return;
    const updatePos = () => {
      const host = hostRef.current;
      const panel = panelRef.current;
      if (!host || !panel) return;
      const hostRect = host.getBoundingClientRect();
      const previousTransform = panel.style.transform;
      panel.style.transform = "";
      const panelRect = panel.getBoundingClientRect();
      panel.style.transform = previousTransform;

      const margin = 12;
      const gap = 8;
      const panelH = panelRect.height;
      const viewportRight = window.innerWidth - margin;
      const viewportBottom = window.innerHeight - margin;
      const placement = hostRect.bottom + gap + panelH <= viewportBottom ? "below" : "above";
      const overflowLeft = Math.max(0, margin - panelRect.left);
      const overflowRight = Math.max(0, panelRect.right - viewportRight);
      const offsetX = overflowLeft || overflowRight ? overflowLeft - overflowRight : 0;
      setPanelPos({ offsetX, placement });
    };

    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("orientationchange", updatePos);
    const onScroll = () => props.onClose();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("orientationchange", updatePos);
      window.removeEventListener("scroll", onScroll);
    };
  }, [props.onClose, props.open]);

  const previousLayers = useMemo(() => props.previousLayers ?? [], [props.previousLayers]);
  const importTools = props.onImportMarginalia || (props.importJobActive && props.onOpenImport) ? (
    <div className="spMarginaliaMenuSection">
      <div className="spMarginaliaMenuSectionTitle muted">Import tools</div>
      <div className="spMarginaliaMenuActions">
        {props.onImportMarginalia ? (
          <button
            type="button"
            className="button buttonCompact"
            onClick={() => {
              props.onClose();
              props.onImportMarginalia?.();
            }}
          >
            Import marginalia...
          </button>
        ) : null}
        {props.importJobActive && props.onOpenImport ? (
          <button
            type="button"
            className="button buttonCompact"
            onClick={() => {
              props.onClose();
              props.onOpenImport?.();
            }}
          >
            Resume import
          </button>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <div className="spMarginaliaMenuHost" ref={hostRef}>
      <button
        type="button"
        className="button buttonCompact spIconButton"
        onClick={() => (props.open ? props.onClose() : props.onOpen())}
        aria-label="Marginalia"
        title="Marginalia"
        ref={buttonRef}
      >
        <MaterialIcon name="ink_highlighter" />
        <span className="spIconButtonLabel">Marginalia</span>
      </button>

      {props.open ? (
        <>
          {createPortal(
            <div
              className="spMarginaliaMenuBackdrop"
              role="presentation"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                props.onClose();
              }}
            />,
            document.body,
          )}
          <div
            ref={panelRef}
            className={`spMarginaliaMenuPanel ${panelPos.placement === "above" ? "spMarginaliaMenuPanelAbove" : ""}`}
            style={panelPos.offsetX ? { transform: `translateX(${panelPos.offsetX}px)` } : undefined}
            role="dialog"
            aria-modal="true"
            aria-label="Marginalia"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="spMarginaliaMenuHeader">
              <div className="spMarginaliaMenuTitle">Marginalia</div>
              <button
                type="button"
                className="button buttonCompact spIconButton spMarginaliaMenuCloseButton"
                onClick={props.onClose}
                aria-label="Close marginalia menu"
                title="Close"
              >
                <MaterialIcon name="close" />
              </button>
            </div>

            <div className="spMarginaliaMenuBody">
              <div className="spMarginaliaMenuSection">
                <div className="spMarginaliaMenuSectionTitle muted">Previous sessions</div>
                {props.listStatus === "loading" ? <div className="muted spMarginaliaEmpty">Loading...</div> : null}
                {props.listStatus === "error" && props.listError ? <div className="muted spMarginaliaEmpty">Failed to load sessions: {props.listError}</div> : null}
                {props.listStatus !== "loading" && previousLayers.length === 0 ? (
                  <div className="muted spMarginaliaEmpty">No previous sessions.</div>
                ) : null}
                {previousLayers.length > 0 ? (
                  <div className="spMarginaliaLayerList" role="group" aria-label="Previous session layers">
                    {previousLayers.map((layer) => {
                      const checked = props.selectedPreviousSessionIds.has(layer.sessionId);
                      const disabled = layer.status === "loading";
                      return (
                        <label
                          key={layer.sessionId}
                          className={`spMarginaliaLayerRow ${checked ? " spMarginaliaLayerRowSelected" : ""}`}
                        >
                          <input
                            className="srOnly"
                            type="checkbox"
                            checked={checked}
                            onChange={() => props.onTogglePreviousSession(layer.sessionId)}
                            disabled={disabled}
                          />
                          <span className="spMarginaliaLayerIndicator" aria-hidden="true">
                            <MaterialIcon name={checked ? "check_circle" : "radio_button_unchecked"} />
                          </span>
                          <span className="spMarginaliaLayerLabel">
                            {layer.labelParts?.length ? <InlineMeta items={layer.labelParts} /> : layer.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {importTools}

              {props.onCloseSession ? (
                <div className="spMarginaliaMenuFooter">
                  <div className="muted spMarginaliaSessionNote">
                    Edit Session Details in Annotations below the book text.
                  </div>
                  <button
                    type="button"
                    className="button buttonCompact spMarginaliaCloseSessionButton"
                    onClick={() => {
                      props.onClose();
                      props.onCloseSession?.();
                    }}
                  >
                    Close session
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
