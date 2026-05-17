import type { ReadingAnnotationCreatePayload } from "../../schemas/readingSession";
import type { ReadingAnnotation } from "../../schemas/readingSession";
import type { LocalHighlight } from "./types";

const EPUB_CFI_CONFORMS_TO = "http://www.idpf.org/epub/linking/cfi/epub-cfi.html";

export function createServerAnnotationPayloadFromLocalHighlight(input: {
  localHighlight: LocalHighlight;
  sessionId: string;
  profileVersion?: string;
}): ReadingAnnotationCreatePayload {
  const note = input.localHighlight.note?.trim() ?? "";
  const motivation = note ? "commenting" : "highlighting";
  const color = input.localHighlight.color ?? "yellow";

  const body: ReadingAnnotationCreatePayload["body"] = [
    {
      type: "TextualBody",
      purpose: "highlighting",
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

function looksLikeColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) return true;
  if (/^rgba?\(/.test(v)) return true;
  // common named colors
  if (["yellow", "red", "blue", "green", "orange", "purple", "pink", "black", "white", "gray", "grey"].includes(v)) {
    return true;
  }
  return false;
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

    if (itemColor && !color) color = itemColor;

    if (purpose === "commenting" && value && !note) {
      note = value;
      continue;
    }

    if ((purpose === "highlighting" || purpose === "describing") && value) {
      // Some servers put selected text in highlighting/describing. Avoid treating colors as text.
      if (!selectedText && !looksLikeColor(value)) selectedText = value;
      // Some servers might put a named color in value.
      if (!color && looksLikeColor(value)) color = value;
    }
  }

  return { text: selectedText, note, color };
}

export function createLocalHighlightFromServerAnnotation(annotation: ReadingAnnotation): LocalHighlight | null {
  const cfiRange = tryGetCfi(annotation);
  if (!cfiRange) return null;

  const id = String(annotation.id ?? "");
  if (!id) return null;

  const { text, note, color } = parseBody(annotation);
  const { createdAt, savedAt } = tryGetTimestamps(annotation);

  return {
    id: `srv_${id}`,
    cfiRange,
    text: text?.trim() || "[server annotation]",
    note: note?.trim() || undefined,
    color: color?.trim() || "yellow",
    createdAt,
    serverAnnotationId: id,
    serverSavedAt: savedAt ?? createdAt,
    serverSaveStatus: "saved",
  };
}
