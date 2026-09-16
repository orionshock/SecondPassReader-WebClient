import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type ListenerCall = {
  options: AddEventListenerOptions | boolean | undefined;
  type: string;
};

type MarksPaneConstructor = new (target: HTMLElement, container: HTMLElement) => unknown;

const require = createRequire(import.meta.url);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("patched epub-ts marks-pane touch listener", () => {
  it("registers the root touchstart proxy as passive without changing mouse listeners", async () => {
    const calls: ListenerCall[] = [];
    const rect = () => ({ bottom: 10, height: 10, left: 0, right: 10, top: 0, width: 10 });
    const target = {
      addEventListener(type: string, _listener: EventListener, options?: AddEventListenerOptions | boolean) {
        calls.push({ options, type });
      },
      getBoundingClientRect: rect,
      nodeName: "DIV",
    } as unknown as HTMLElement;
    const container = {
      appendChild: vi.fn(),
      getBoundingClientRect: rect,
    } as unknown as HTMLElement;
    const svg = {
      appendChild: vi.fn(),
      getBoundingClientRect: rect,
      scrollHeight: 10,
      scrollWidth: 10,
      setAttribute: vi.fn(),
      style: { setProperty: vi.fn() },
    } as unknown as SVGElement;

    vi.stubGlobal("document", {
      body: container,
      createElementNS: () => svg,
    });
    vi.stubGlobal("MouseEvent", class {});

    const MarksPane = await loadMarksPaneConstructor();
    new MarksPane(target, container);

    expect(calls).toEqual([
      { type: "mouseup", options: false },
      { type: "mousedown", options: false },
      { type: "click", options: false },
      { type: "touchstart", options: { passive: true } },
    ]);
  });
});

async function loadMarksPaneConstructor(): Promise<MarksPaneConstructor> {
  const bundlePath = join(dirname(require.resolve("@likecoin/epub-ts")), "epub.js");
  let source = await readFile(bundlePath, "utf8");

  // The published package exposes no marks-pane entry point. Instrument this
  // versioned generated bundle in memory so the regression exercises its code.
  source = source
    .replace(/^import[^\n]+\n/, "const pe = {};\n")
    .replace("export {\n  Fe as Annotations,", "export {\n  Ft as __PatchTestMarksPane,\n  Fe as Annotations,");

  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const module = await import(/* @vite-ignore */ url) as { __PatchTestMarksPane?: MarksPaneConstructor };
  if (!module.__PatchTestMarksPane) throw new Error("epub-ts marks pane was not found in the 0.7.2 ESM bundle.");
  return module.__PatchTestMarksPane;
}
