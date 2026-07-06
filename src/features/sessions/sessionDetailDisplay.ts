export function formatIso(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
  } catch {
    return iso;
  }
}

export function formatProgress(p?: number | null): string | null {
  if (typeof p !== "number" || !Number.isFinite(p)) return null;
  const clamped = Math.min(1, Math.max(0, p));
  return `${Math.round(clamped * 100)}%`;
}

export function normalizeStatus(status?: string | null, isActive?: boolean | null): "active" | "completed" | "archived" | string {
  if (isActive === true) return "active";
  const raw = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (raw === "active" || raw === "completed" || raw === "archived") return raw;
  if (raw) return raw;
  if (isActive === false) return "completed";
  return "active";
}

export function formatAnnotationCount(n?: number | null): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const count = Math.max(0, Math.floor(n));
  return count === 1 ? "1 annotation" : `${count} annotations`;
}

export function getAnnotationTexts(annotation: unknown): { quote: string | null; note: string | null } {
  const highlightText = typeof (annotation as any)?.highlight_text === "string" ? (annotation as any).highlight_text.replace(/\s+/g, " ").trim() : "";
  const quoteText = typeof (annotation as any)?.quote === "string" ? (annotation as any).quote.replace(/\s+/g, " ").trim() : "";
  const commentText = typeof (annotation as any)?.comment_text === "string" ? (annotation as any).comment_text.replace(/\s+/g, " ").trim() : "";
  if (highlightText || quoteText || commentText) {
    return { quote: highlightText || quoteText || null, note: commentText || null };
  }

  const bodies = (annotation as any)?.body;
  if (!Array.isArray(bodies)) return { quote: null, note: null };

  const textBodies: Array<{ purpose: string | null; value: string }> = [];
  for (const b of bodies) {
    if (!b || typeof b !== "object") continue;
    const type = (b as any).type;
    if (typeof type === "string" && type !== "TextualBody") continue;

    const value = (b as any).value;
    if (typeof value !== "string") continue;
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const purposeRaw = (b as any).purpose;
    const purpose = typeof purposeRaw === "string" ? purposeRaw.trim().toLowerCase() : null;
    textBodies.push({ purpose, value: trimmed });
  }

  if (!textBodies.length) return { quote: null, note: null };

  const quote = textBodies.find((tb) => tb.purpose === "describing")?.value ?? null;
  const note = textBodies.find((tb) => tb.purpose === "commenting")?.value ?? null;
  if (quote || note) return { quote, note };

  const rawMotivation = (annotation as any)?.motivation;
  const motivations: string[] = Array.isArray(rawMotivation)
    ? rawMotivation.filter((x): x is string => typeof x === "string")
    : typeof rawMotivation === "string"
      ? [rawMotivation]
      : [];
  const isHighlight = motivations.includes("highlighting");
  const isComment = motivations.includes("commenting");

  // Minimal fallbacks (explicit):
  // - Highlight-only: use first textual body as quote.
  // - Comment-only: if there is only one textual body, treat it as note-only.
  if (isHighlight) return { quote: textBodies[0]?.value ?? null, note: null };
  if (isComment && textBodies.length === 1) return { quote: null, note: textBodies[0]?.value ?? null };

  return { quote: textBodies[0]?.value ?? null, note: null };
}
