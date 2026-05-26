import type { ReadingAnnotation, ReadingAnnotationCreatePayload, ReadingAnnotationUpdatePayload } from "@secondpass/client";
import type { LocalAnnotation, LocalBookmark, LocalHighlight } from "./types";
import { DEFAULT_HIGHLIGHT_COLOR, isHighlightColor, type HighlightColor } from "./highlightColors";

const EPUB_CFI_CONFORMS_TO = "http://www.idpf.org/epub/linking/cfi/epub-cfi.html";

export function createServerAnnotationPayloadFromLocalHighlight(input: {
  localHighlight: LocalHighlight;
  sessionId: string;
  profileVersion?: string;
}): ReadingAnnotationCreatePayload {
  const note = input.localHighlight.note?.trim() ?? "";
  const motivation = note ? "commenting" : "highlighting";
  const rawColor = input.localHighlight.color;
  const color: HighlightColor = isHighlightColor(rawColor) ? rawColor : DEFAULT_HIGHLIGHT_COLOR;

  const body: ReadingAnnotationCreatePayload["body"] = [
    {
      type: "TextualBody",
      purpose: "describing",
      value: input.localHighlight.text,
      color,
    },
  ];

  if (note) {
    body.push({
      type: "TextualBody",
      purpose: "commenting",
      value: note,
    });
  }

  return {
    profile_version: input.profileVersion ?? "0.1.0",
    session: input.sessionId,
    motivation,
    target: {
      selector: {
        type: "FragmentSelector",
        conformsTo: EPUB_CFI_CONFORMS_TO,
        value: input.localHighlight.cfiRange,
      },
    },
    body,
  };
}

export function createServerAnnotationUpdatePayloadFromLocalHighlight(input: {
  localHighlight: LocalHighlight;
  sessionId: string;
  profileVersion?: string;
}): ReadingAnnotationUpdatePayload {
  // For Phase 1, PATCH uses the same tight shape as create (server rejects unknown fields).
  return createServerAnnotationPayloadFromLocalHighlight(input);
}

export function createServerBookmarkPayloadFromCfi(input: {
  cfi: string;
  sessionId: string;
  profileVersion?: string;
}): ReadingAnnotationCreatePayload {
  return {
    profile_version: input.profileVersion ?? "0.1.0",
    session: input.sessionId,
    motivation: "bookmarking",
    target: {
      selector: {
        type: "FragmentSelector",
        conformsTo: EPUB_CFI_CONFORMS_TO,
        value: input.cfi,
      },
    },
  };
}

function looksLikeColor(value: string): boolean {
  return isHighlightColor(value);
}

function tryGetCfi(annotation: ReadingAnnotation): string | null {
  const target: any = annotation.target as any;
  const selector = target?.selector ?? target?.selectors?.[0] ?? null;
  const value = selector?.value;
  return typeof value === "string" && value.trim() ? value : null;
}

function tryGetTimestamps(annotation: ReadingAnnotation): { createdAt: string; savedAt?: string } {
  const anyAnn: any = annotation as any;
  const created =
    (typeof anyAnn.created_at === "string" && anyAnn.created_at) ||
    (typeof anyAnn.created === "string" && anyAnn.created) ||
    new Date().toISOString();
  const updated =
    (typeof anyAnn.updated_at === "string" && anyAnn.updated_at) ||
    (typeof anyAnn.modified === "string" && anyAnn.modified) ||
    undefined;
  return { createdAt: created, savedAt: updated };
}

function parseBody(annotation: ReadingAnnotation): { text?: string; note?: string; color?: string } {
  const body = Array.isArray(annotation.body) ? (annotation.body as any[]) : [];

  let note: string | undefined;
  let color: string | undefined;
  let selectedText: string | undefined;

  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const purpose = typeof item.purpose === "string" ? item.purpose : undefined;
    const value = typeof item.value === "string" ? item.value : undefined;
    const itemColor = typeof item.color === "string" ? item.color : undefined;

    if (itemColor && !color && isHighlightColor(itemColor)) color = itemColor;

    if (purpose === "commenting" && value && !note) {
      note = value;
      continue;
    }

    if (purpose === "describing" && value) {
      if (!selectedText) selectedText = value;
      continue;
    }

    if (purpose === "highlighting" && value) {
      // legacy server bodies: treat as selected text only if it isn't a color token
      if (!selectedText && !looksLikeColor(value)) selectedText = value;
      if (!color && looksLikeColor(value)) color = value;
    }
  }

  return { text: selectedText, note, color };
}

function parseMotivations(annotation: ReadingAnnotation): string[] {
  const raw = (annotation as any)?.motivation;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : typeof raw === "string" ? [raw] : [];
}

export function createLocalAnnotationFromServerAnnotation(annotation: ReadingAnnotation): LocalAnnotation | null {
  const cfi = tryGetCfi(annotation);
  if (!cfi) return null;

  const id = String(annotation.id ?? "");
  if (!id) return null;

  const motivations = parseMotivations(annotation);
  const isBookmark = motivations.includes("bookmarking");
  const { createdAt, savedAt } = tryGetTimestamps(annotation);

  if (isBookmark) {
    const bookmark: LocalBookmark = {
      kind: "bookmark",
      id: `srv_${id}`,
      cfi,
      createdAt,
      serverAnnotationId: id,
      serverSavedAt: savedAt ?? createdAt,
      serverSaveStatus: "saved",
    };
    return bookmark;
  }

  const { text, note, color } = parseBody(annotation);
  const highlight: LocalHighlight = {
    kind: "highlight",
    id: `srv_${id}`,
    cfiRange: cfi,
    text: text?.trim() || "[server annotation]",
    note: note?.trim() || undefined,
    color: isHighlightColor(color) ? color : DEFAULT_HIGHLIGHT_COLOR,
    createdAt,
    serverAnnotationId: id,
    serverSavedAt: savedAt ?? createdAt,
    serverSaveStatus: "saved",
  };
  return highlight;
}

export function createLocalHighlightFromServerAnnotation(annotation: ReadingAnnotation): LocalHighlight | null {
  const local = createLocalAnnotationFromServerAnnotation(annotation);
  return local && local.kind === "highlight" ? local : null;
}
