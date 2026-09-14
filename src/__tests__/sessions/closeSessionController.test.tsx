// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCloseSession } from "../../features/sessions/CloseSession.Controller";
import { CloseSessionDialog } from "../../features/sessions/CloseSessionDialog.UI";

let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useCloseSession>;
const submit = vi.fn();
function Harness() {
  state = useCloseSession({ initialName: "Saved", initialNotes: "Notes", afterOptions: [{ action: "detail", label: "Detail" }], onSaveAndClose: submit });
  return null;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  submit.mockReset();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it("retains the close draft after failure and stays busy on success until the caller dismisses", async () => {
  await act(async () => root.render(<Harness />));
  act(() => { state.changeName("  Final  "); state.changeNotes(" Notes "); state.chooseAfterAction("sessions"); });
  submit.mockRejectedValueOnce(new Error("failed"));
  await act(async () => state.submit());
  expect(submit).toHaveBeenLastCalledWith({ name: "Final", notes: " Notes ", afterAction: "sessions" });
  expect(state.name).toBe("  Final  ");
  expect(state.error).toBeTruthy();
  expect(state.busy).toBe(false);
  submit.mockResolvedValueOnce(undefined);
  await act(async () => state.submit());
  expect(state.busy).toBe(true);
  expect(state.error).toBeNull();
});

it("blocks dialog dismissal while submitting and allows Escape after failure", async () => {
  let reject!: (error: Error) => void;
  submit.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  const cancel = vi.fn();
  await act(async () => root.render(<CloseSessionDialog initialName="Saved" initialNotes="Notes" onCancel={cancel} onSaveAndClose={submit} />));
  const close = [...container.querySelectorAll("button")].find((node) => node.textContent === "Close Reading Session")!;
  act(() => close.click());
  expect(close.disabled).toBe(true);
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(cancel).not.toHaveBeenCalled();
  await act(async () => reject(new Error("failed")));
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(close.disabled).toBe(false);
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  expect(cancel).toHaveBeenCalledTimes(1);
});
