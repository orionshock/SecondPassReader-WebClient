// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveAppRouteForWorkflow,
  useAppRouteWorkflowLifecycle,
} from "../../app/AppRouteWorkflow.Lifecycle";
import type { AppWorkflowStep } from "../../app/AppWorkflow.Policy";

describe("App route workflow lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    window.location.hash = "";
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it.each([
    ["connect_server", { kind: "connect" }],
    ["pair_device", { kind: "pair" }],
    ["verify_connection", { kind: "verify" }],
  ] as const)("resolves an empty %s startup directly", (workflowStep, expected) => {
    expect(resolveAppRouteForWorkflow(null, workflowStep)).toEqual(expected);
  });

  it("keeps valid authenticated deep links and normalizes invalid routes", () => {
    expect(resolveAppRouteForWorkflow({ kind: "reader", bookId: "book-1" }, "library_home")).toBeNull();
    expect(resolveAppRouteForWorkflow({ kind: "settings", tab: "offline", bookId: "book-1" }, "library_home"))
      .toBeNull();
    expect(resolveAppRouteForWorkflow({ kind: "unknown", raw: "#/bad" }, "library_home"))
      .toEqual({ kind: "home" });
    expect(resolveAppRouteForWorkflow({ kind: "pair" }, "library_home"))
      .toEqual({ kind: "home" });
  });

  it("owns workflow replacement once without redirecting again after publication", async () => {
    window.location.hash = "#/library";
    const replaceState = vi.spyOn(window.history, "replaceState");

    await act(async () => root.render(<Harness workflowStep="pair_device" />));
    await settle();

    expect(window.location.hash).toBe("#/pair");
    expect(replaceState).toHaveBeenCalledOnce();

    await act(async () => root.render(<Harness workflowStep="pair_device" />));
    await settle();
    expect(replaceState).toHaveBeenCalledOnce();
  });
});

function Harness({ workflowStep }: { workflowStep: AppWorkflowStep }) {
  useAppRouteWorkflowLifecycle(workflowStep);
  return null;
}

async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}
