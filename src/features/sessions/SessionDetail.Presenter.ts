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

export function getSessionDisplayName(name?: string | null, sessionId?: string | null): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed) return trimmed;

  const id = typeof sessionId === "string" ? sessionId.trim() : "";
  const suffix = id.length >= 6 ? id.slice(-6) : "";
  return suffix ? `Unnamed Session ${suffix}` : "Unnamed Session";
}
