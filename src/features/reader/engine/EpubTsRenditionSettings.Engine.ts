import type { Rendition } from "@likecoin/epub-ts";
import { normalizeReaderSettings, type ReaderSettings } from "../../../storage/readerSettings";
import { getReaderSettingsPresentation } from "../settings/readerDisplaySettings";
import { resolveReaderReflowCfi } from "./ReaderReflowTarget.Engine";

export function createEpubTsRenditionSettingsEngine({
  rendition,
  isDestroyed,
  getCurrentCfi,
}: {
  rendition: Rendition;
  isDestroyed: () => boolean;
  getCurrentCfi: () => string | null;
}) {
  let lastAppliedDisplaySettingsKey = "";

  return {
    async applyDisplaySettings(
      settings: ReaderSettings,
      options?: { reanchor?: boolean; preserveCfi?: string | null },
    ): Promise<void> {
      if (isDestroyed()) return;
      const normalized = normalizeReaderSettings(settings);
      const key = JSON.stringify({
        theme: normalized.theme,
        fontFamily: normalized.fontFamily,
        fontSizePercent: normalized.fontSizePercent,
        lineHeight: normalized.lineHeight,
      });
      if (lastAppliedDisplaySettingsKey === key) return;

      const reanchorCfi = options?.reanchor
        ? resolveReaderReflowCfi(options.preserveCfi, getCurrentCfi)
        : null;
      const presentation = getReaderSettingsPresentation(normalized);

      // One replaceable stylesheet avoids stale rules from previously selected themes.
      rendition.themes.registerRules("secondpass-reader-settings", presentation.epub.rules);
      rendition.themes.select("secondpass-reader-settings");
      rendition.themes.fontSize(presentation.epub.fontSize);
      rendition.themes.override("line-height", presentation.epub.lineHeight, true);

      if (presentation.epub.fontFamily) rendition.themes.font(presentation.epub.fontFamily);
      else rendition.themes.removeOverride("font-family");

      lastAppliedDisplaySettingsKey = key;

      if (reanchorCfi && !isDestroyed()) {
        await rendition.display(reanchorCfi);
      } else if (options?.reanchor && !isDestroyed()) {
        try {
          await rendition.reportLocation();
        } catch {
          // Location may be unavailable before the first display.
        }
      }
    },
  };
}
