export function getSessionDisplayName(name?: string | null, sessionId?: string | null): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed) return trimmed;

  const id = typeof sessionId === "string" ? sessionId.trim() : "";
  const suffix = id.length >= 6 ? id.slice(-6) : "";
  return suffix ? `Unnamed Reading Session ${suffix}` : "Unnamed Reading Session";
}
