import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon";
import { InlineMeta } from "../../../components/MetaSeparator";

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
          <div
            className="spMarginaliaMenuBackdrop"
            role="presentation"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.onClose();
            }}
          />
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
              {props.onCloseSession ? (
                <div className="spMarginaliaMenuSection">
                  <div className="spMarginaliaMenuSectionTitle muted">Session</div>
                  <button
                    type="button"
                    className="button buttonCompact"
                    onClick={() => {
                      props.onClose();
                      props.onCloseSession?.();
                    }}
                  >
                    Close session
                  </button>
                </div>
              ) : null}

              <div className="spMarginaliaMenuSectionTitle muted">Previous sessions</div>
              {props.listStatus === "loading" ? <div className="muted spMarginaliaEmpty">Loading…</div> : null}
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
                      <label key={layer.sessionId} className="spMarginaliaLayerRow">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => props.onTogglePreviousSession(layer.sessionId)}
                          disabled={disabled}
                        />
                        <span className="spMarginaliaLayerLabel">
                          {layer.labelParts?.length ? <InlineMeta items={layer.labelParts} /> : layer.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
