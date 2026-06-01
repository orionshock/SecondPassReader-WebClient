import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon";

export type MarginaliaLayerSummary = {
  sessionId: string;
  label: string;
  highlightCount: number;
};

export function MarginaliaMenu(props: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  previousLayers: MarginaliaLayerSummary[];
  selectedPreviousSessionIds: Set<string>;
  onTogglePreviousSession: (sessionId: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);

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

  useEffect(() => {
    if (!props.open) return;
    const updatePos = () => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const top = rect.bottom + 8;
      const right = Math.max(12, window.innerWidth - rect.right);
      setPanelPos({ top: Math.max(8, top), right });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, { passive: true });
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos);
    };
  }, [props.open]);

  const previousLayers = useMemo(() => props.previousLayers ?? [], [props.previousLayers]);

  return (
    <div className="spMarginaliaMenuHost" ref={hostRef}>
      <button
        type="button"
        className="button buttonCompact spIconButton"
        onClick={() => (props.open ? props.onClose() : props.onOpen())}
        aria-label="Marginalia"
        title="Marginalia"
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
            style={panelPos ? { top: panelPos.top, right: panelPos.right } : undefined}
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
              <div className="spMarginaliaMenuSectionTitle muted">Previous sessions</div>
              {previousLayers.length === 0 ? <div className="muted spMarginaliaEmpty">No previous sessions.</div> : null}
              {previousLayers.length > 0 ? (
                <div className="spMarginaliaLayerList" role="group" aria-label="Previous session layers">
                  {previousLayers.map((layer) => {
                    const checked = props.selectedPreviousSessionIds.has(layer.sessionId);
                    return (
                      <label key={layer.sessionId} className="spMarginaliaLayerRow">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => props.onTogglePreviousSession(layer.sessionId)}
                        />
                        <span className="spMarginaliaLayerLabel">{layer.label}</span>
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
