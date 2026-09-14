// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MarginaliaSessionDetail, SecondPassClient } from "@secondpass/client";
import { useSessionDetail } from "../../features/sessions/SessionDetail.Controller";
import { SessionDetailPage } from "../../features/sessions/SessionDetailPage.UI";
import { sessionFixture } from "./SessionTest.Fixtures";

const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn() }));
vi.mock("../../app/AppNavigation.Router", () => ({ navigateTo }));

const detail = (name = "Saved", status: "active" | "closed" = "active"): MarginaliaSessionDetail => ({
  session: sessionFixture({ name, status }),
  context: { book: { id: "book-1", title: "Book", coverUrl: null, canOpen: true } },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useSessionDetail>;
let api: { get: ReturnType<typeof vi.fn>; getAnnotations: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
let spl: SecondPassClient | null;
function Harness({ sessionId = "session-1" }: { sessionId?: string }) {
  state = useSessionDetail({ spl, sessionId });
  return null;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  api = {
    get: vi.fn().mockResolvedValue(detail()),
    getAnnotations: vi.fn().mockResolvedValue({ annotations: [] }),
    update: vi.fn().mockResolvedValue(detail("Updated")),
    close: vi.fn().mockResolvedValue(detail("Closed", "closed")),
  };
  spl = { marginalia: { sessions: api } } as unknown as SecondPassClient;
  navigateTo.mockClear();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it("loads detail and annotations independently, without reloading for editor/dialog interactions", async () => {
  const sessionRequest = deferred<MarginaliaSessionDetail>();
  const annotationRequest = deferred<{ annotations: [] }>();
  api.get.mockReturnValue(sessionRequest.promise);
  api.getAnnotations.mockReturnValue(annotationRequest.promise);
  await act(async () => root.render(<Harness />));
  expect(state.busy).toBe(true);
  expect(state.annoBusy).toBe(true);
  await act(async () => sessionRequest.resolve(detail()));
  expect(state.busy).toBe(false);
  expect(state.isActive).toBe(true);
  expect(state.annoBusy).toBe(true);
  await act(async () => annotationRequest.resolve({ annotations: [] }));
  act(() => { state.nameEditor.onBeginNameEdit(); state.openCloseDialog(); });
  act(() => { state.nameEditor.onChangeName("Draft"); state.dismissCloseDialog(); });
  expect(state.nameEditor.draftName).toBe("Draft");
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.getAnnotations).toHaveBeenCalledTimes(1);
});

it("keeps detail usable after annotation failure and resets data on a new session", async () => {
  api.getAnnotations.mockRejectedValue(new Error("unavailable"));
  await act(async () => root.render(<Harness />));
  expect(state.session?.name).toBe("Saved");
  expect(state.error).toBeNull();
  expect(state.annoError).toBeTruthy();
  expect(state.annoBusy).toBe(false);
  api.get.mockReturnValue(new Promise(() => {}));
  api.getAnnotations.mockReturnValue(new Promise(() => {}));
  act(() => state.openCloseDialog());
  await act(async () => root.render(<Harness sessionId="session-2" />));
  expect(state.session).toBeNull();
  expect(state.annotations).toBeNull();
  expect(state.closeDialogOpen).toBe(false);
  expect(state.annoError).toBeNull();
});

it("settles detail errors independently of successful annotations", async () => {
  api.get.mockRejectedValue(new Error("offline"));
  await act(async () => root.render(<Harness />));
  expect(state.session).toBeNull();
  expect(state.busy).toBe(false);
  expect(state.error).toBeTruthy();
  expect(state.annotations).toEqual([]);
  expect(state.annoError).toBeNull();
});

it("saves one metadata field, retains drafts on failure, and uses the update response without reloading", async () => {
  await act(async () => root.render(<Harness />));
  act(() => { state.nameEditor.onBeginNameEdit(); state.nameEditor.onChangeName("  New  "); });
  const request = deferred<MarginaliaSessionDetail>();
  api.update.mockReturnValueOnce(request.promise);
  let saving!: Promise<void>;
  act(() => { saving = state.nameEditor.onSaveName(); });
  expect(state.nameEditor.saveBusy).toBe(true);
  expect(api.update).toHaveBeenLastCalledWith("session-1", { name: "  New  " });
  await act(async () => { request.resolve(detail("New")); await saving; });
  expect(state.session?.name).toBe("New");
  expect(state.nameEditor.editingName).toBe(false);
  act(() => { state.notesEditor.onBeginNotesEdit(); state.notesEditor.onChangeNotes("New notes"); });
  api.update.mockRejectedValueOnce(new Error("failed"));
  await act(async () => state.notesEditor.onSaveNotes());
  expect(api.update).toHaveBeenLastCalledWith("session-1", { notes: "New notes" });
  expect(state.notesEditor.editingNotes).toBe(true);
  expect(state.notesEditor.draftNotes).toBe("New notes");
  expect(state.notesEditor.saveBusy).toBe(false);
  expect(state.notesEditor.saveError).toBeTruthy();
  await act(async () => state.notesEditor.onSaveNotes());
  expect(state.notesEditor.editingNotes).toBe(false);
  expect(state.notesEditor.saveError).toBeNull();
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.getAnnotations).toHaveBeenCalledTimes(1);
});

it("keeps closed sessions read-only", async () => {
  api.get.mockResolvedValue(detail("Closed", "closed"));
  await act(async () => root.render(<Harness />));
  await act(async () => { await state.nameEditor.onSaveName(); await state.notesEditor.onSaveNotes(); });
  expect(state.isActive).toBe(false);
  expect(api.update).not.toHaveBeenCalled();
});

it("updates metadata before close, waits to navigate, then applies the close response", async () => {
  await act(async () => root.render(<Harness />));
  act(() => state.openCloseDialog());
  const update = deferred<MarginaliaSessionDetail>();
  const close = deferred<MarginaliaSessionDetail>();
  api.update.mockReturnValue(update.promise);
  api.close.mockReturnValue(close.promise);
  let closing!: Promise<void>;
  act(() => { closing = state.saveAndClose({ name: "Final", notes: "Final notes", afterAction: "sessions" }); });
  expect(api.update).toHaveBeenCalledWith("session-1", { name: "Final", notes: "Final notes" });
  expect(api.close).not.toHaveBeenCalled();
  await act(async () => update.resolve(detail("Final")));
  expect(api.close).toHaveBeenCalledWith("session-1");
  expect(navigateTo).not.toHaveBeenCalled();
  await act(async () => { close.resolve(detail("Final", "closed")); await closing; });
  expect(state.isActive).toBe(false);
  expect(state.nameEditor.draftName).toBe("Final");
  expect(state.closeDialogOpen).toBe(false);
  expect(navigateTo).toHaveBeenCalledExactlyOnceWith({ kind: "sessions" });
});

it("skips unchanged metadata and retains the dialog when close fails", async () => {
  await act(async () => root.render(<Harness />));
  act(() => state.openCloseDialog());
  api.close.mockRejectedValueOnce("failed");
  await act(async () => {
    await expect(state.saveAndClose({ name: "Saved", notes: "Session note", afterAction: "detail" })).rejects.toThrow("Failed to close session.");
  });
  expect(api.update).not.toHaveBeenCalled();
  expect(state.closeDialogOpen).toBe(true);
  expect(state.isActive).toBe(true);
  expect(navigateTo).not.toHaveBeenCalled();
  await act(async () => state.saveAndClose({ name: "Saved", notes: "Session note", afterAction: "detail" }));
  expect(state.closeDialogOpen).toBe(false);
  expect(navigateTo).not.toHaveBeenCalled();
});

it("does not close or navigate if the preceding metadata update fails", async () => {
  await act(async () => root.render(<Harness />));
  api.update.mockRejectedValueOnce(new Error("failed"));
  await act(async () => {
    await expect(state.saveAndClose({ name: "Changed", notes: "", afterAction: "sessions" })).rejects.toThrow("failed");
  });
  expect(api.close).not.toHaveBeenCalled();
  expect(navigateTo).not.toHaveBeenCalled();
});

it("binds editor commands and restores close-dialog focus without reloading the page data", async () => {
  await act(async () => root.render(<SessionDetailPage spl={spl} profile={null} sessionId="session-1" />));
  const button = (text: string) => [...container.querySelectorAll("button")].find((node) => node.textContent === text)!;
  act(() => (container.querySelector('[aria-label="Edit Reading Session name"]') as HTMLButtonElement).click());
  expect(container.querySelector('[aria-label="Reading Session name"]')).not.toBeNull();
  act(() => button("Cancel").click());
  expect(container.querySelector('[aria-label="Reading Session name"]')).toBeNull();
  const opener = button("Close Reading Session");
  act(() => { opener.focus(); opener.click(); });
  expect(container.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.getAnnotations).toHaveBeenCalledTimes(1);
});

it.each(["success", "failure"])("ignores obsolete detail %s while preserving the newer session", async (outcome) => {
  let resolve!: (value: MarginaliaSessionDetail) => void;
  let reject!: (error: Error) => void;
  api.get.mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
  await act(async () => root.render(<Harness />));
  api.get.mockResolvedValueOnce(detail("Session B"));
  await act(async () => root.render(<Harness sessionId="session-2" />));
  await act(async () => {
    if (outcome === "success") resolve(detail("Session A")); else reject(new Error("obsolete"));
  });
  expect(state.session?.name).toBe("Session B");
  expect(state.error).toBeNull();
  expect(state.busy).toBe(false);
});

it.each(["success", "failure"])("ignores obsolete annotation %s without settling B's annotation request", async (outcome) => {
  let resolve!: (value: { annotations: [] }) => void;
  let reject!: (error: Error) => void;
  api.getAnnotations.mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
  await act(async () => root.render(<Harness />));
  const current = deferred<{ annotations: [] }>();
  api.getAnnotations.mockReturnValueOnce(current.promise);
  await act(async () => root.render(<Harness sessionId="session-2" />));
  await act(async () => {
    if (outcome === "success") resolve({ annotations: [] }); else reject(new Error("obsolete"));
  });
  expect(state.annotations).toBeNull();
  expect(state.annoError).toBeNull();
  expect(state.annoBusy).toBe(true);
  await act(async () => current.resolve({ annotations: [] }));
  expect(state.annoBusy).toBe(false);
});

it.each(["success", "failure"])("ignores obsolete metadata %s without changing B's draft, error, or busy state", async (outcome) => {
  await act(async () => root.render(<Harness />));
  let resolve!: (value: MarginaliaSessionDetail) => void;
  let reject!: (error: Error) => void;
  api.update.mockReturnValueOnce(new Promise((done, fail) => { resolve = done; reject = fail; }));
  let oldSave!: Promise<void>;
  act(() => { oldSave = state.nameEditor.onSaveName(); });
  api.get.mockResolvedValueOnce(detail("Session B"));
  await act(async () => root.render(<Harness sessionId="session-2" />));
  expect(state.nameEditor.saveBusy).toBe(false);
  const current = deferred<MarginaliaSessionDetail>();
  api.update.mockReturnValueOnce(current.promise);
  act(() => { state.notesEditor.onBeginNotesEdit(); state.notesEditor.onChangeNotes("B draft"); });
  let newSave!: Promise<void>;
  act(() => { newSave = state.notesEditor.onSaveNotes(); });
  await act(async () => {
    if (outcome === "success") resolve(detail("Session A")); else reject(new Error("obsolete"));
    await oldSave;
  });
  expect(state.session?.name).toBe("Session B");
  expect(state.notesEditor.draftNotes).toBe("B draft");
  expect(state.notesEditor.saveBusy).toBe(true);
  expect(state.notesEditor.saveError).toBeNull();
  expect(api.update.mock.calls.map(([id]) => id)).toEqual(["session-1", "session-2"]);
  await act(async () => { current.resolve(detail("B updated")); await newSave; });
});

it("finishes the original update/close remotely after an identity change without publishing or navigating", async () => {
  await act(async () => root.render(<Harness />));
  const update = deferred<MarginaliaSessionDetail>();
  const close = deferred<MarginaliaSessionDetail>();
  api.update.mockReturnValueOnce(update.promise);
  api.close.mockReturnValueOnce(close.promise);
  let pending!: Promise<void>;
  act(() => { pending = state.saveAndClose({ name: "Final A", notes: "Final notes", afterAction: "sessions" }); });
  api.get.mockResolvedValueOnce(detail("Session B"));
  await act(async () => root.render(<Harness sessionId="session-2" />));
  act(() => state.openCloseDialog());
  await act(async () => update.resolve(detail("Final A")));
  expect(api.close).toHaveBeenCalledExactlyOnceWith("session-1");
  await act(async () => { close.resolve(detail("Final A", "closed")); await pending; });
  expect(state.session?.name).toBe("Session B");
  expect(state.isActive).toBe(true);
  expect(state.closeDialogOpen).toBe(true);
  expect(navigateTo).not.toHaveBeenCalled();
});

it("does not navigate when a close finishes after the page unmounts", async () => {
  await act(async () => root.render(<Harness />));
  const close = deferred<MarginaliaSessionDetail>();
  api.close.mockReturnValueOnce(close.promise);
  let pending!: Promise<void>;
  act(() => { pending = state.saveAndClose({ name: "Saved", notes: "Session note", afterAction: "sessions" }); });
  act(() => root.render(null));
  await act(async () => { close.resolve(detail("Closed", "closed")); await pending; });
  expect(navigateTo).not.toHaveBeenCalled();
});

it("invalidates detail and annotations when the client disconnects", async () => {
  const request = deferred<MarginaliaSessionDetail>();
  const annotations = deferred<{ annotations: [] }>();
  api.get.mockReturnValueOnce(request.promise);
  api.getAnnotations.mockReturnValueOnce(annotations.promise);
  await act(async () => root.render(<Harness />));
  spl = null;
  await act(async () => root.render(<Harness />));
  await act(async () => { request.resolve(detail()); annotations.resolve({ annotations: [] }); });
  expect(state.session).toBeNull();
  expect(state.annotations).toBeNull();
  expect(state.busy).toBe(false);
  expect(state.annoBusy).toBe(false);
});
