// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModalDialogFocus } from "../../components/ModalDialogFocus.Lifecycle";

function TestDialog({ onDismiss }: { onDismiss: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const initialRef = useRef<HTMLButtonElement | null>(null);
  useModalDialogFocus({ active: true, dialogRef, initialFocusRef: initialRef, onDismiss });
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}>
      <button ref={initialRef} type="button">First</button>
      <button type="button">Last</button>
    </div>
  );
}

describe("modal dialog focus lifecycle", () => {
  let host: HTMLDivElement;
  let root: Root;
  let opener: HTMLButtonElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.append(opener);
    opener.focus();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    opener.remove();
  });

  it("focuses inside, contains Tab, dismisses on Escape, and restores the opener", () => {
    const onDismiss = vi.fn();
    act(() => root.render(<TestDialog onDismiss={onDismiss} />));
    const buttons = host.querySelectorAll("button");
    expect(document.activeElement).toBe(buttons[0]);

    act(() => {
      buttons[1]?.focus();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[0]);

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onDismiss).toHaveBeenCalledOnce();

    act(() => root.unmount());
    expect(document.activeElement).toBe(opener);
    root = createRoot(host);
  });
});
