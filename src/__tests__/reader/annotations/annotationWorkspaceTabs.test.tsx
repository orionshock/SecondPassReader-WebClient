// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnotationWorkspaceTabs } from "../../../features/reader/annotations/AnnotationWorkspaceTabs.UI";

describe("annotation workspace tabs", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses roving focus and activates tabs with arrow keys", () => {
    const onChange = vi.fn();
    act(() => root.render(<AnnotationWorkspaceTabs tab="current" onChange={onChange} />));
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs[0]?.tabIndex).toBe(0);
    expect(tabs[1]?.tabIndex).toBe(-1);
    expect(tabs[0]?.getAttribute("aria-controls")).toBe("annotation-current-panel");

    act(() => {
      tabs[0]?.focus();
      tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("previous");
    expect(document.activeElement).toBe(tabs[1]);
  });
});
