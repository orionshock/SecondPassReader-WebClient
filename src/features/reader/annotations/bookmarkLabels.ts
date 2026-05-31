export function formatPercent(bookProgress: number): string {
  const pct = Math.round(bookProgress * 100);
  return `${pct}%`;
}

export function deriveBookmarkLabel(input: {
  chapterLabel?: string | null;
  bookProgress?: number | null | undefined;
}): string {
  const chapter = input.chapterLabel?.trim() ? input.chapterLabel.trim() : null;
  const p = input.bookProgress;
  const hasProgress = typeof p === "number" && Number.isFinite(p);
  const progressText = hasProgress ? formatPercent(p) : null;

  if (chapter && progressText) return `${chapter} · ${progressText}`;
  if (chapter) return chapter;
  if (progressText) return `Saved location · ${progressText}`;
  return "Saved location";
}

