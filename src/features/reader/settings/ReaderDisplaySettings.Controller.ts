import { useCallback, useMemo, useState } from "react";
import {
  getReaderSettings,
  normalizeReaderSettings,
  resetReaderSettings,
  saveReaderSettings,
  type ReaderSettings,
} from "../../../storage/readerSettings";

export function useReaderDisplaySettings(initialSettings?: ReaderSettings) {
  const [settings, setSettings] = useState<ReaderSettings>(() => normalizeReaderSettings(initialSettings ?? getReaderSettings()));

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = normalizeReaderSettings({ ...prev, ...patch });
      saveReaderSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(resetReaderSettings());
  }, []);

  return useMemo(
    () => ({
      settings,
      updateSettings,
      resetSettings,
    }),
    [resetSettings, settings, updateSettings],
  );
}
