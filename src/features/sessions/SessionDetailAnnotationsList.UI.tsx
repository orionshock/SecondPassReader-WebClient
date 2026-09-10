import type { MarginaliaAnnotation } from "@secondpass/client";
import { InlineMeta } from "../../components/Metadata.UI";
import { MaterialIcon } from "../../components/MaterialIcon.UI";
import {
  getAnnotationColor,
  getAnnotationDisplayTexts,
  getRawAnnotationDisplay,
  toAnnotationCssVars,
} from "../reader/display/ReaderAnnotation.Presenter";
import { formatIso } from "./SessionDetail.Presenter";

export function SessionDetailAnnotationsList({
  annotations,
  annoBusy,
  annoError,
}: {
  annotations: MarginaliaAnnotation[] | null;
  annoBusy: boolean;
  annoError: string | null;
}) {
  return (
    <div className="sessionAnnotations">
      <div className="panelHeaderRow" style={{ marginTop: 10 }}>
        <div className="panelTitle" style={{ margin: 0 }}>
          Annotations
        </div>
        {annotations ? <div className="muted">{annotations.length} total</div> : null}
      </div>

      {annoError ? <div className="errorText">{annoError}</div> : null}
      {annoBusy ? <div className="muted">{`Loading${"\u2026"}`}</div> : null}

      {annotations?.length ? (
        <div className="sessionAnnoList">
          {annotations.map((a) => {
            const when = formatIso(a.updatedAt);
            const { quote, note } = getAnnotationDisplayTexts(a);
            const { iconName, label } = getRawAnnotationDisplay(a, note);
            const metaBits = [when ? when : null].filter(Boolean);
            const color = quote ? getAnnotationColor(a) : null;
            const colorVars = color ? toAnnotationCssVars(color) : null;
            return (
              <div
                key={a.id}
                className="sessionAnnoRow"
              >
                <div className="sessionAnnoIcon" aria-hidden="true" title={label}>
                  <MaterialIcon name={iconName} />
                </div>
                <div className="sessionAnnoMain">
                  {quote ? (
                    <div
                      className="sessionAnnoQuote"
                      style={
                        colorVars
                          ? { ["--annotation-color" as any]: colorVars.color, ["--annotation-bg" as any]: colorVars.bg }
                          : undefined
                      }
                    >
                      {quote}
                    </div>
                  ) : null}
                  {note ? (
                    <div className="sessionAnnoNote">{note}</div>
                  ) : !quote ? (
                    <div className="sessionAnnoNote">{label}</div>
                  ) : null}
                  {metaBits.length ? (
                    <div className="sessionAnnoMeta muted">
                      <InlineMeta items={metaBits} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : !annoBusy ? (
        <div className="muted">No annotations yet.</div>
      ) : null}

    </div>
  );
}
