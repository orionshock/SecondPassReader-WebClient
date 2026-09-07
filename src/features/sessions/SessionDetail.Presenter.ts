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

export function formatAnnotationCount(n?: number | null): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const count = Math.max(0, Math.floor(n));
  return count === 1 ? "1 annotation" : `${count} annotations`;
}
