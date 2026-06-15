import type { ReadingAnnotationPage } from "@secondpass/client";
import { InlineMeta } from "../../components/MetaSeparator";
import { MaterialIcon } from "../../components/MaterialIcon";
import { getRawAnnotationDisplay } from "../reader/annotations/annotationDisplay";
import { formatIso, getAnnotationTexts } from "./sessionDetailDisplay";

export function SessionDetailAnnotationsList({
  annoPage,
  annoBusy,
  annoError,
  annoLoadingMore,
  onLoadMore,
}: {
  annoPage: ReadingAnnotationPage | null;
  annoBusy: boolean;
  annoError: string | null;
  annoLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="sessionAnnotations">
      <div className="panelHeaderRow" style={{ marginTop: 10 }}>
        <div className="panelTitle" style={{ margin: 0 }}>
          Annotations
        </div>
        {annoPage ? <div className="muted">{annoPage.count ?? 0} total</div> : null}
      </div>

      {annoError ? <div className="errorText">{annoError}</div> : null}
      {annoBusy ? <div className="muted">{`Loading${"\u2026"}`}</div> : null}

      {annoPage?.results?.length ? (
        <div className="sessionAnnoList">
          {annoPage.results.map((a) => {
            const updated = (a.updated_at as any) || (a.modified as any) || (a.created_at as any) || (a.created as any);
            const when = typeof updated === "string" ? formatIso(updated) : null;
            const { quote, note } = getAnnotationTexts(a);
            const { iconName, label } = getRawAnnotationDisplay(a, note);
            const metaBits = [when ? when : null].filter(Boolean);
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
                    <div className="sessionAnnoQuote">{quote}</div>
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

      {annoPage?.next ? (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="button buttonCompact" onClick={onLoadMore} disabled={annoLoadingMore}>
            {annoLoadingMore ? `Loading${"\u2026"}` : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
