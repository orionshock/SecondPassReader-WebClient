// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReaderSettingsReflowLifecycle } from "../../../features/reader/shell/ReaderSettingsReflow.Lifecycle";
import type { ReaderRuntimeController, ReaderRuntimeReflowIntent } from "../../../features/reader/shell/ReaderRuntime.Controller";
import { normalizeReaderSettings, type ReaderSettings } from "../../../storage/ReaderSettings.Store";

describe("Reader settings reflow lifecycle", () => {
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement("div"));
  });

  afterEach(() => act(() => root.unmount()));

  it("submits only a layout-settled resize for a width-only change", async () => {
    const harness = await mountHarness(root);

    await harness.render(settings({ readerWidth: "wide" }));

    expect(harness.intents).toEqual([
      expect.objectContaining({ type: "resize-to-mount", timing: "after-layout" }),
    ]);
  });

  it("submits only settings application for a renderer-only change", async () => {
    const harness = await mountHarness(root);

    await harness.render(settings({ theme: "dark" }));

    expect(harness.intents).toEqual([
      expect.objectContaining({ type: "apply-settings", settings: expect.objectContaining({ theme: "dark" }) }),
    ]);
  });

  it("applies renderer settings before resizing for a combined change", async () => {
    const harness = await mountHarness(root);

    await harness.render(settings({ theme: "sepia", readerWidth: "narrow" }));

    expect(harness.intents.map((intent) => intent.type)).toEqual([
      "apply-settings",
      "resize-to-mount",
    ]);
  });
});

async function mountHarness(root: Root) {
  let currentSettings = settings();
  const intents: ReaderRuntimeReflowIntent[] = [];
  const runtimeController = {
    reflow: vi.fn(async (intent: ReaderRuntimeReflowIntent) => { intents.push(intent); }),
  } as unknown as ReaderRuntimeController;

  function Harness() {
    useReaderSettingsReflowLifecycle({
      settings: currentSettings,
      readiness: "ready",
      engineRef: { current: {} as never },
      engineGenerationRef: { current: 1 },
      runtimeController,
      reportOperationError: vi.fn(),
    });
    return null;
  }

  const render = async (next: ReaderSettings) => {
    currentSettings = next;
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  await render(currentSettings);
  intents.length = 0;
  return { intents, render };
}

function settings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
  return normalizeReaderSettings(overrides);
}
