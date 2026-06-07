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
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

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
      const btn = buttonRef.current;
      const panel = panelRef.current;
      if (!btn || !panel) return;
      const btnRect = btn.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      const margin = 12;
      const gap = 8;
      const panelW = panelRect.width;
      const panelH = panelRect.height;
      const viewportRight = window.innerWidth - margin;
      const viewportBottom = window.innerHeight - margin;

      const preferredTop = btnRect.bottom + gap;
      const flippedTop = btnRect.top - panelH - gap;
      const top = preferredTop + panelH <= viewportBottom ? preferredTop : Math.max(margin, flippedTop);

      const preferredLeft = btnRect.right - panelW;
      const maxLeft = Math.max(margin, viewportRight - panelW);
      const left = Math.min(Math.max(margin, preferredLeft), maxLeft);
      setPanelPos({ top, left });
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
        <div
          className="spMarginaliaMenuBackdrop"
          role="presentation"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
            props.onClose();
          }}
        >
          <div
            ref={panelRef}
            className="spMarginaliaMenuPanel"
            style={panelPos ? { top: panelPos.top, left: panelPos.left } : { visibility: "hidden" }}
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
        </div>
      ) : null}
    </div>
  );
}
