import type { PreviousSessionAnnotationItem } from "./PreviousSessionAnnotationItems.Presenter";

export type PreviousSessionLayerSummary = {
  sessionId: string;
  label: string;
  labelParts: string[];
  highlightCount: number;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
};

export type PreviousSessionAnnotationGroup = {
  sessionId: string;
  label: string;
  labelParts: string[];
  highlightCount: number;
  selected: boolean;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  items?: PreviousSessionAnnotationItem[];
};

export type PreviousSessionSummaryViewModel = {
  sessionId: string;
  timeLabel: string;
  name: string | null;
  annotationCount: number | null;
};

export type PreviousSessionSummaryWithUpdatedAt = PreviousSessionSummaryViewModel & {
  updatedAt: string | null;
};

export function toSessionTimeLabel(input: { startedAt?: string | null; updatedAt?: string | null; createdAt?: string | null; closedAt?: string | null; fallbackId: string }): string {
  const ts =
    (typeof input.updatedAt === "string" ? input.updatedAt : null) ??
    (typeof input.closedAt === "string" ? input.closedAt : null) ??
    (typeof input.startedAt === "string" ? input.startedAt : null) ??
    (typeof input.createdAt === "string" ? input.createdAt : null);
  if (!ts) return input.fallbackId;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return input.fallbackId;
  return new Date(ms).toLocaleString();
}

export function buildLayerLabelParts(input: { name?: string | null; timeLabel: string; highlightCount: number }): string[] {
  const n = typeof input.name === "string" ? input.name.trim() : "";
  return [
    n || null,
    input.timeLabel,
    `${input.highlightCount} highlight${input.highlightCount === 1 ? "" : "s"}`,
  ].filter((part): part is string => Boolean(part));
}

export function getPreviousSessionHighlightCount(input: {
  cachedHighlightCount?: number;
  annotationCount?: number | null;
}): number {
  return typeof input.cachedHighlightCount === "number"
    ? input.cachedHighlightCount
    : typeof input.annotationCount === "number"
      ? input.annotationCount
      : 0;
}

export function toPreviousSessionSummary(input: {
  id?: unknown;
  name?: unknown;
  annotationCount?: unknown;
  updatedAt?: unknown;
  closedAt?: unknown;
  startedAt?: unknown;
}): PreviousSessionSummaryWithUpdatedAt {
  const sessionId = typeof input.id === "string" ? input.id : "";
  const updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : null;
  const closedAt = typeof input.closedAt === "string" ? input.closedAt : null;
  const startedAt = typeof input.startedAt === "string" ? input.startedAt : null;
  const timeLabel = toSessionTimeLabel({
    updatedAt,
    closedAt,
    startedAt,
    fallbackId: sessionId || "(unknown session)",
  });
  const name = typeof input.name === "string" ? input.name : null;
  const annotationCount = typeof input.annotationCount === "number" ? input.annotationCount : null;
  return { sessionId, timeLabel, name, annotationCount, updatedAt };
}

export function sortPreviousSessionSummariesByUpdatedAt(
  items: PreviousSessionSummaryWithUpdatedAt[],
): PreviousSessionSummaryWithUpdatedAt[] {
  return [...items].sort((a, b) => {
    const am = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bm = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return (Number.isFinite(bm) ? bm : 0) - (Number.isFinite(am) ? am : 0);
  });
}

export function stripPreviousSessionUpdatedAt(
  item: PreviousSessionSummaryWithUpdatedAt,
): PreviousSessionSummaryViewModel {
  const { updatedAt: _updatedAt, ...rest } = item;
  return rest;
}

export function toPreviousSessionLayerSummary(input: {
  summary: PreviousSessionSummaryViewModel;
  highlightCount: number;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
}): PreviousSessionLayerSummary {
  const labelParts = buildLayerLabelParts({
    name: input.summary.name,
    timeLabel: input.summary.timeLabel,
    highlightCount: input.highlightCount,
  });
  return {
    sessionId: input.summary.sessionId,
    label: labelParts.join(" "),
    labelParts,
    highlightCount: input.highlightCount,
    status: input.status,
    error: input.error,
  };
}

export function toPreviousSessionAnnotationGroup(input: {
  summary: PreviousSessionSummaryViewModel;
  highlightCount: number;
  selected: boolean;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  items?: PreviousSessionAnnotationItem[];
}): PreviousSessionAnnotationGroup {
  const labelParts = buildLayerLabelParts({
    name: input.summary.name,
    timeLabel: input.summary.timeLabel,
    highlightCount: input.highlightCount,
  });
  return {
    sessionId: input.summary.sessionId,
    label: labelParts.join(" "),
    labelParts,
    highlightCount: input.highlightCount,
    selected: input.selected,
    status: input.status,
    error: input.error,
    items: input.items,
  };
}
