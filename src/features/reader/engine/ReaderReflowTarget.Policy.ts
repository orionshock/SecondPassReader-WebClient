export type ReaderReflowTargetOptions = {
  preserveCfi?: string | null;
};

export function resolveReaderReflowCfi(
  preserveCfi: string | null | undefined,
  getCurrentCfi: () => string | null,
): string | null {
  const preserved = normalizeCfi(preserveCfi);
  return preserved ?? normalizeCfi(getCurrentCfi());
}

function normalizeCfi(value?: string | null): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}
