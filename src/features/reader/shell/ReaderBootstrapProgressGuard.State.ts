import type { ReadingShellCommandValue } from "./types";

export class ReaderBootstrapProgressGuard {
  private generation: number | null = null;
  private initialCfi: string | null = null;
  private protectionActive = false;

  reset(generation: number, initialCfi?: string | null): void {
    const normalizedCfi = normalizeCfi(initialCfi);
    this.generation = generation;
    this.initialCfi = normalizedCfi;
    this.protectionActive = normalizedCfi !== null;
  }

  recordExplicitNavigation(generation: number): void {
    if (generation !== this.generation) return;
    this.protectionActive = false;
  }

  shouldPublishRelocation(generation: number, cfi?: string): boolean {
    if (generation !== this.generation) return false;
    if (!this.protectionActive) return true;
    return normalizeCfi(cfi) === this.initialCfi;
  }
}

export function isExplicitProgressNavigationCommand(command: ReadingShellCommandValue): boolean {
  return command.type !== "resize";
}

function normalizeCfi(value?: string | null): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}
