import { describe, expect, it, vi } from "vitest";
import { StagedSelectionLifecycle } from "../features/reader/shell/StagedSelection.Lifecycle";

describe("StagedSelectionLifecycle", () => {
  it("cancels staged state once when unrelated navigation relocates the reader", async () => {
    const cancelStagedSelection = vi.fn();
    const onUnrelatedNavigation = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({ cancelStagedSelection, onUnrelatedNavigation });

    await lifecycle.runNavigation("unrelated", async () => {
      lifecycle.handleLocationChanged();
    });

    expect(cancelStagedSelection).toHaveBeenCalledOnce();
    expect(onUnrelatedNavigation).toHaveBeenCalledOnce();
  });

  it("preserves staged state during import display and staging, then cancels on later navigation", async () => {
    const cancelStagedSelection = vi.fn();
    const onUnrelatedNavigation = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({ cancelStagedSelection, onUnrelatedNavigation });

    await lifecycle.runNavigation("import-staging", async () => {
      lifecycle.handleLocationChanged();
    });
    expect(cancelStagedSelection).not.toHaveBeenCalled();

    lifecycle.handleLocationChanged();
    expect(cancelStagedSelection).toHaveBeenCalledOnce();
    expect(onUnrelatedNavigation).toHaveBeenCalledOnce();
  });

  it("preserves staged state during layout reflow", async () => {
    const cancelStagedSelection = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({
      cancelStagedSelection,
      onUnrelatedNavigation: vi.fn(),
    });

    await lifecycle.runNavigation("layout-reflow", async () => {
      lifecycle.handleLocationChanged();
    });

    expect(cancelStagedSelection).not.toHaveBeenCalled();
  });
});
