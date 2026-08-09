import { describe, expect, it, vi } from "vitest";
import { StagedSelectionLifecycle } from "../features/reader/shell/StagedSelection.Lifecycle";

describe("StagedSelectionLifecycle", () => {
  it("cancels staged state once when unrelated navigation relocates the reader", async () => {
    const cancelStagedSelection = vi.fn();
    const onUnrelatedNavigation = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({ cancelStagedSelection, hasStagedSelection: () => true, onUnrelatedNavigation });

    let relocation;
    await lifecycle.runNavigation("unrelated", async () => {
      relocation = lifecycle.handleLocationChanged();
    });

    expect(relocation).toEqual({ action: "ignored", shouldReanchor: false });
    expect(cancelStagedSelection).toHaveBeenCalledOnce();
    expect(onUnrelatedNavigation).toHaveBeenCalledOnce();
  });

  it("preserves different-CFI trailing relocations owned by import staging", async () => {
    const cancelStagedSelection = vi.fn();
    const onUnrelatedNavigation = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({ cancelStagedSelection, hasStagedSelection: () => true, onUnrelatedNavigation });

    let activeRelocation;
    await lifecycle.runNavigation("import-staging", async () => {
      activeRelocation = lifecycle.handleLocationChanged("epubcfi(/6/20)");
    });
    expect(activeRelocation).toEqual({ action: "preserved", shouldReanchor: true });
    expect(cancelStagedSelection).not.toHaveBeenCalled();

    expect(lifecycle.handleLocationChanged("epubcfi(/6/22)")).toEqual({ action: "preserved", shouldReanchor: true });
    expect(cancelStagedSelection).not.toHaveBeenCalled();

    expect(lifecycle.handleLocationChanged("epubcfi(/6/30)").shouldReanchor).toBe(true);
    expect(lifecycle.handleLocationChanged("epubcfi(/6/44)").shouldReanchor).toBe(true);
    expect(cancelStagedSelection).not.toHaveBeenCalled();
    expect(onUnrelatedNavigation).not.toHaveBeenCalled();
  });

  it("explicit display navigation invalidates import protection and cancels immediately", async () => {
    const cancelStagedSelection = vi.fn();
    const onUnrelatedNavigation = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({ cancelStagedSelection, hasStagedSelection: () => true, onUnrelatedNavigation });

    await lifecycle.runNavigation("import-staging", async () => undefined);
    lifecycle.handleLocationChanged("epubcfi(/6/20)");
    let relocation;
    await lifecycle.runNavigation("unrelated", async () => {
      relocation = lifecycle.handleLocationChanged("epubcfi(/6/22)");
    });

    expect(relocation).toEqual({ action: "ignored", shouldReanchor: false });
    expect(cancelStagedSelection).toHaveBeenCalledOnce();
    expect(onUnrelatedNavigation).toHaveBeenCalledOnce();
  });

  it("invalidates pending import relocation protection when unrelated navigation starts", async () => {
    const cancelStagedSelection = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({
      cancelStagedSelection,
      hasStagedSelection: () => true,
      onUnrelatedNavigation: vi.fn(),
    });

    await lifecycle.runNavigation("import-staging", async () => undefined);
    let relocation;
    await lifecycle.runNavigation("unrelated", async () => {
      relocation = lifecycle.handleLocationChanged();
    });

    expect(relocation).toEqual({ action: "ignored", shouldReanchor: false });
    expect(cancelStagedSelection).toHaveBeenCalledOnce();
    lifecycle.handleLocationChanged("epubcfi(/6/20)");
    expect(cancelStagedSelection).toHaveBeenCalledTimes(2);
  });

  it("replaces operation-owned protection when cycling import candidates", async () => {
    const cancelStagedSelection = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({
      cancelStagedSelection,
      hasStagedSelection: () => true,
      onUnrelatedNavigation: vi.fn(),
    });

    await lifecycle.runNavigation("import-staging", async () => undefined);
    lifecycle.handleLocationChanged("epubcfi(/6/20)");
    await lifecycle.runNavigation("import-staging", async () => undefined);
    lifecycle.handleLocationChanged("epubcfi(/6/30)");
    lifecycle.handleLocationChanged("epubcfi(/6/40)");

    expect(cancelStagedSelection).not.toHaveBeenCalled();
    lifecycle.handleLocationChanged("epubcfi(/6/20)");
    expect(cancelStagedSelection).not.toHaveBeenCalled();
  });

  it("preserves staged state across different-CFI layout relocations", async () => {
    const cancelStagedSelection = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({
      cancelStagedSelection,
      hasStagedSelection: () => true,
      onUnrelatedNavigation: vi.fn(),
    });

    let activeRelocation;
    await lifecycle.runNavigation("layout-reflow", async () => {
      activeRelocation = lifecycle.handleLocationChanged("epubcfi(/6/40)");
    });

    expect(activeRelocation).toEqual({ action: "preserved", shouldReanchor: true });
    expect(cancelStagedSelection).not.toHaveBeenCalled();
    expect(lifecycle.handleLocationChanged("epubcfi(/6/42)")).toEqual({ action: "preserved", shouldReanchor: true });
    expect(lifecycle.handleLocationChanged("epubcfi(/6/48)")).toEqual({ action: "preserved", shouldReanchor: true });
    expect(cancelStagedSelection).not.toHaveBeenCalled();
  });

  it("manual staged state preserves on layout reflow and cancels on explicit navigation", async () => {
    const cancelStagedSelection = vi.fn();
    const onUnrelatedNavigation = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({ cancelStagedSelection, hasStagedSelection: () => true, onUnrelatedNavigation });

    await lifecycle.runNavigation("layout-reflow", async () => undefined);
    lifecycle.handleLocationChanged("epubcfi(/6/50)");
    expect(cancelStagedSelection).not.toHaveBeenCalled();

    await lifecycle.runNavigation("unrelated", async () => undefined);
    expect(cancelStagedSelection).toHaveBeenCalledOnce();
    expect(onUnrelatedNavigation).toHaveBeenCalledOnce();
  });

  it("still cancels an ordinary staged selection on an unprotected relocation", () => {
    const cancelStagedSelection = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({
      cancelStagedSelection,
      hasStagedSelection: () => true,
      onUnrelatedNavigation: vi.fn(),
    });

    expect(lifecycle.handleLocationChanged()).toEqual({ action: "canceled", shouldReanchor: false });

    expect(cancelStagedSelection).toHaveBeenCalledOnce();
  });

  it("does not request re-anchor for a protected relocation without staged state", async () => {
    const lifecycle = new StagedSelectionLifecycle({
      cancelStagedSelection: vi.fn(),
      hasStagedSelection: () => false,
      onUnrelatedNavigation: vi.fn(),
    });

    await lifecycle.runNavigation("import-staging", async () => undefined);

    expect(lifecycle.handleLocationChanged("epubcfi(/6/20)")).toEqual({
      action: "preserved",
      shouldReanchor: false,
    });
  });
});
