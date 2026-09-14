export const DEBUG_LOG_STORAGE_KEY = "secondpass.debug.logs";
export const DEBUG_IMPORT_VERBOSE_STORAGE_KEY = "secondpass.debug.logs.imports.verbose";
export const DEBUG_LOG_CATEGORIES = ["imports", "staged-selection", "reader"] as const;

export type DebugLogCategory = (typeof DEBUG_LOG_CATEGORIES)[number];

export function isDebugEnabled(category: DebugLogCategory | string): boolean {
  const normalized = normalizeDebugCategory(category);
  if (!normalized) return false;
  return readDebugSelection().has(normalized);
}

export function getEnabledDebugCategories(): DebugLogCategory[] {
  const enabled = readDebugSelection();
  return DEBUG_LOG_CATEGORIES.filter((category) => enabled.has(category));
}

export function setEnabledDebugCategories(categories: readonly DebugLogCategory[]): void {
  const enabled = new Set(categories);
  const normalized = DEBUG_LOG_CATEGORIES.filter((category) => enabled.has(category));
  try {
    const storage = getLocalStorage();
    if (!storage) return;
    if (normalized.length === 0) {
      storage.removeItem(DEBUG_LOG_STORAGE_KEY);
    } else if (normalized.length === DEBUG_LOG_CATEGORIES.length) {
      storage.setItem(DEBUG_LOG_STORAGE_KEY, "*");
    } else {
      storage.setItem(DEBUG_LOG_STORAGE_KEY, normalized.join(","));
    }
  } catch {
    // Debug logging must never interfere with app startup or settings changes.
  }
}

export function isImportDebugVerbose(): boolean {
  try {
    return getLocalStorage()?.getItem(DEBUG_IMPORT_VERBOSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setImportDebugVerbose(enabled: boolean): void {
  try {
    const storage = getLocalStorage();
    if (!storage) return;
    if (enabled) storage.setItem(DEBUG_IMPORT_VERBOSE_STORAGE_KEY, "1");
    else storage.removeItem(DEBUG_IMPORT_VERBOSE_STORAGE_KEY);
  } catch {
    // Debug logging must never interfere with settings changes.
  }
}

export function debugLog(
  category: DebugLogCategory,
  message: string,
  details?: Record<string, unknown>,
): void {
  if (!isDebugEnabled(category)) return;
  // eslint-disable-next-line no-console
  if (details === undefined) console.debug(`[SPR ${category}] ${message}`);
  // eslint-disable-next-line no-console
  else console.debug(`[SPR ${category}] ${message}`, details);
}

export function debugWarn(
  category: DebugLogCategory,
  message: string,
  details?: Record<string, unknown>,
): void {
  if (!isDebugEnabled(category)) return;
  // eslint-disable-next-line no-console
  if (details === undefined) console.warn(`[SPR ${category}] ${message}`);
  // eslint-disable-next-line no-console
  else console.warn(`[SPR ${category}] ${message}`, details);
}

function readDebugSelection(): Set<DebugLogCategory> {
  const enabled = new Set<DebugLogCategory>();
  try {
    const storage = getLocalStorage();
    if (!storage) return enabled;
    const primary = storage.getItem(DEBUG_LOG_STORAGE_KEY)?.trim().toLowerCase() ?? "";
    if (primary === "*" || primary === "all") {
      for (const category of DEBUG_LOG_CATEGORIES) enabled.add(category);
    } else if (!isDisabledValue(primary)) {
      for (const value of primary.split(",")) {
        const category = normalizeDebugCategory(value);
        if (category) enabled.add(category);
      }
    }
  } catch {
    return new Set<DebugLogCategory>();
  }
  return enabled;
}

function normalizeDebugCategory(value: string): DebugLogCategory | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "import") return "imports";
  if (normalized === "staged" || normalized === "stagedselection") return "staged-selection";
  return DEBUG_LOG_CATEGORIES.find((category) => category === normalized) ?? null;
}

function isDisabledValue(value: string): boolean {
  return value === "" || value === "0" || value === "false" || value === "off";
}

function getLocalStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
