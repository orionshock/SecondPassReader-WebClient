import { describe, expect, it, vi } from "vitest";
import type { ReaderSettings } from "../storage/readerSettings";
import { createEpubTsRenditionSettingsEngine } from "../features/reader/engine/EpubTsRenditionSettings.Engine";

describe("epub-ts rendition settings engine", () => {
  it("keeps reader width outside rendition theme identity", async () => {
    const harness = createHarness();
    await harness.engine.applyDisplaySettings(settings({ readerWidth: "normal" }), { reanchor: false });
    await harness.engine.applyDisplaySettings(settings({ readerWidth: "wide" }), { reanchor: true });

    expect(harness.themes.registerRules).toHaveBeenCalledOnce();
    expect(harness.rendition.display).not.toHaveBeenCalled();
    expect(harness.rendition.reportLocation).not.toHaveBeenCalled();
  });

  it("applies the replaceable theme before redisplaying the preserved CFI", async () => {
    const order: string[] = [];
    const harness = createHarness(order);
    await harness.engine.applyDisplaySettings(settings({ fontFamily: "publisher" }), { reanchor: false });
    order.length = 0;

    await harness.engine.applyDisplaySettings(settings({ fontFamily: "serif" }), {
      reanchor: true,
      preserveCfi: " epubcfi(/6/24) ",
    });

    expect(harness.themes.registerRules).toHaveBeenLastCalledWith("secondpass-reader-settings", expect.any(Object));
    expect(harness.themes.select).toHaveBeenLastCalledWith("secondpass-reader-settings");
    expect(harness.themes.font).toHaveBeenLastCalledWith('Georgia, "Times New Roman", Times, serif');
    expect(harness.rendition.display).toHaveBeenCalledWith("epubcfi(/6/24)");
    expect(order.at(-1)).toBe("display");
  });
});

function createHarness(order: string[] = []) {
  const themes = {
    registerRules: vi.fn(() => { order.push("registerRules"); }),
    select: vi.fn(() => { order.push("select"); }),
    fontSize: vi.fn(() => { order.push("fontSize"); }),
    override: vi.fn(() => { order.push("override"); }),
    font: vi.fn(() => { order.push("font"); }),
    removeOverride: vi.fn(() => { order.push("removeOverride"); }),
  };
  const rendition = {
    themes,
    display: vi.fn(async () => { order.push("display"); }),
    reportLocation: vi.fn(async () => { order.push("reportLocation"); }),
  } as unknown as Parameters<typeof createEpubTsRenditionSettingsEngine>[0]["rendition"];
  return {
    themes,
    rendition,
    engine: createEpubTsRenditionSettingsEngine({
      rendition,
      isDestroyed: () => false,
      getCurrentCfi: () => "epubcfi(/6/10)",
    }),
  };
}

function settings(overrides: Partial<ReaderSettings>): ReaderSettings {
  return {
    fontSizePercent: 100,
    theme: "light",
    readerWidth: "normal",
    lineHeight: "normal",
    fontFamily: "publisher",
    ...overrides,
  };
}
