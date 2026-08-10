export type AppTheme = "system" | "light" | "dark";

const STORAGE_KEY = "secondpass.appTheme.v1";
const THEMES: AppTheme[] = ["system", "light", "dark"];

export function normalizeAppTheme(value: unknown): AppTheme {
  return THEMES.includes(value as AppTheme) ? (value as AppTheme) : "system";
}

export function getAppTheme(): AppTheme {
  try {
    return normalizeAppTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function saveAppTheme(theme: AppTheme): void {
  localStorage.setItem(STORAGE_KEY, theme);
}
