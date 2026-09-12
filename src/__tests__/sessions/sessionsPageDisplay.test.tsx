// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SecondPassClient } from "@secondpass/client";

const { loadSessionsPageMock } = vi.hoisted(() => ({
  loadSessionsPageMock: vi.fn(),
}));

vi.mock("../../features/reader/ReaderMarginalia.Queries", () => ({
  loadSessionsPage: loadSessionsPageMock,
}));

import { SessionsPage } from "../../features/sessions/SessionsPage.UI";
import { rawSessionId, sessionListItemFixture } from "./SessionTest.Fixtures";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  loadSessionsPageMock.mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [sessionListItemFixture({ name: "", notes: "" })],
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Sessions page display", () => {
  it("shows the derived unnamed-session label without exposing the raw session id", async () => {
    await act(async () => {
      root.render(<SessionsPage profile={null} spl={{} as SecondPassClient} />);
    });

    expect(container.textContent).toContain("Unnamed Session 5a7445");
    expect(container.innerHTML).not.toContain(rawSessionId);
    expect(container.querySelector('[aria-label="Manage Unnamed Session 5a7445"]')).not.toBeNull();
    expect(container.querySelector('[role="group"][aria-label="Session filter"]')).not.toBeNull();
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("All");
    expect(container.querySelector("h1")?.textContent).toBe("Reading sessions");
  });
});
