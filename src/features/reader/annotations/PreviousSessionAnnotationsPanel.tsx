import { useMemo } from "react";
import { MaterialIcon } from "../../../components/MaterialIcon";
import { InlineMeta } from "../../../components/MetaSeparator";
import { BOOKMARK_DISPLAY, getHighlightAnnotationDisplay } from "./annotationDisplay";
import type { PreviousSessionAnnotationGroup, PreviousSessionAnnotationItem } from "../session/usePreviousSessionLayers";
import { toAnnotationCssVars } from "./annotationColors";

function normalizeQuoteTextForDisplay(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatWhen(ts: string | undefined): string | null {
  const s = typeof ts === "string" ? ts.trim() : "";
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return s;
  return new Date(ms).toLocaleString();
}

function ReadOnlyItemRow({ item }: { item: PreviousSessionAnnotationItem }) {
  if (item.kind === "bookmark") {
    return (
    <article tabIndex={-1} data-annotation-id={item.id} className="spAnnotationCard spAnnotationCardBookmark spAnnotationCardReadOnly">
        <div className="spAnnotationLeftRail" aria-hidden="true">
          <span className="spAnnotationTypeIcon" title={BOOKMARK_DISPLAY.label}>
            <MaterialIcon name={BOOKMARK_DISPLAY.iconName} />
          </span>
        </div>
        <div className="spAnnotationBody">
          <div className="spAnnotationQuote">{item.cfi}</div>
          {formatWhen(item.timestamp) ? <div className="muted spAnnotationActionMeta">{formatWhen(item.timestamp)}</div> : null}
        </div>
      </article>
    );
  }

  const when = formatWhen(item.timestamp);
  const vars = toAnnotationCssVars(item.color);
  const display = getHighlightAnnotationDisplay(item.note);
  return (
    <article
      tabIndex={-1}
      data-annotation-id={item.id}
      className="spAnnotationCard spAnnotationCardHighlight spAnnotationCardReadOnly"
      style={{ ["--annotation-color" as any]: vars.color, ["--annotation-bg" as any]: vars.bg }}
    >
      <div className="spAnnotationLeftRail" aria-hidden="true">
        <span className="spAnnotationTypeIcon" title={display.label}>
          <MaterialIcon name={display.iconName} />
        </span>
      </div>
      <div className="spAnnotationBody">
        <div className="spAnnotationQuote">{normalizeQuoteTextForDisplay(item.text)}</div>
        {item.note ? <div className="spAnnotationNote muted">{item.note}</div> : null}
        <div className="muted spAnnotationActionMeta">
          <InlineMeta items={[when, item.color]} />
        </div>
      </div>
    </article>
  );
}

export function PreviousSessionAnnotationsPanel(props: {
  groups: PreviousSessionAnnotationGroup[];
  onEnableInMarginalia: (sessionId: string) => void;
}) {
  const groups = useMemo(() => {
    const g = [...(props.groups ?? [])];
    g.sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
    return g;
  }, [props.groups]);

  if (groups.length === 0) return <div className="muted">No previous sessions.</div>;

  return (
    <div className="spPreviousSessionsPanel" aria-label="Previous session annotations">
      {groups.map((g) => (
        <section key={g.sessionId} className="spPreviousSessionGroup">
          <div className="spPreviousSessionHeader">
            <div className="spPreviousSessionHeaderActions">
              <button
                type="button"
                className="button buttonCompact"
                onClick={() => props.onEnableInMarginalia(g.sessionId)}
                title={g.selected ? "Disable layer" : "Enable layer"}
                disabled={g.status === "loading"}
              >
                {g.selected ? "Disable" : "Enable"}
              </button>
            </div>
            <div className="spPreviousSessionTitle" title={g.label}>
              <InlineMeta items={g.labelParts.length ? g.labelParts : [g.label]} />
            </div>
          </div>

          {g.selected ? (
            <>
              {g.status === "loading" ? <div className="muted">Loading annotations...</div> : null}
              {g.status === "error" ? <div className="muted">Failed to load annotations{g.error ? `: ${g.error}` : "."}</div> : null}
              {g.status === "idle" ? <div className="muted">Enable in Marginalia to load highlights.</div> : null}
              {g.status === "ready" && (!g.items || g.items.length === 0) ? <div className="muted">No annotations in this session.</div> : null}

              {g.status === "ready" && g.items && g.items.length > 0 ? (
                <div className="spAnnotationList" aria-label="Previous session annotations list">
                  {g.items.map((item) => (
                    <ReadOnlyItemRow key={`${item.kind}:${item.id}`} item={item} />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ))}
    </div>
  );
}
