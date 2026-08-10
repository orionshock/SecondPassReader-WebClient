import { useEffect, useState } from "react";
import { getAppTheme, saveAppTheme, type AppTheme } from "../storage/AppTheme.Store";

export function useAppThemeLifecycle() {
  const [appTheme, setAppTheme] = useState<AppTheme>(() => getAppTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = appTheme;
    document.documentElement.style.colorScheme = appTheme === "dark" ? "dark" : appTheme === "light" ? "light" : "";
    saveAppTheme(appTheme);
  }, [appTheme]);

  return { appTheme, setAppTheme };
}
