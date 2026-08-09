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

  it("preserves repeated same-CFI trailing relocations after import staging", async () => {
    const cancelStagedSelection = vi.fn();
    const onUnrelatedNavigation = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({ cancelStagedSelection, onUnrelatedNavigation });

    await lifecycle.runNavigation("import-staging", async () => {
      lifecycle.handleLocationChanged("epubcfi(/6/20)");
    });
    expect(cancelStagedSelection).not.toHaveBeenCalled();

    lifecycle.handleLocationChanged("epubcfi(/6/20)");
    expect(cancelStagedSelection).not.toHaveBeenCalled();

    lifecycle.handleLocationChanged("epubcfi(/6/20)");
    lifecycle.handleLocationChanged("epubcfi(/6/20)");
    expect(cancelStagedSelection).not.toHaveBeenCalled();
    expect(onUnrelatedNavigation).not.toHaveBeenCalled();
  });

  it("cancels when a relocation differs from the protected settled CFI", async () => {
    const cancelStagedSelection = vi.fn();
    const onUnrelatedNavigation = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({ cancelStagedSelection, onUnrelatedNavigation });

    await lifecycle.runNavigation("import-staging", async () => undefined);
    lifecycle.handleLocationChanged("epubcfi(/6/20)");
    lifecycle.handleLocationChanged("epubcfi(/6/22)");

    expect(cancelStagedSelection).toHaveBeenCalledOnce();
    expect(onUnrelatedNavigation).toHaveBeenCalledOnce();
  });

  it("invalidates pending import relocation protection when unrelated navigation starts", async () => {
    const cancelStagedSelection = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({
      cancelStagedSelection,
      onUnrelatedNavigation: vi.fn(),
    });

    await lifecycle.runNavigation("import-staging", async () => undefined);
    await lifecycle.runNavigation("unrelated", async () => {
      lifecycle.handleLocationChanged();
    });

    expect(cancelStagedSelection).toHaveBeenCalledOnce();
    lifecycle.handleLocationChanged("epubcfi(/6/20)");
    expect(cancelStagedSelection).toHaveBeenCalledTimes(2);
  });

  it("replaces settled relocation protection when cycling import candidates", async () => {
    const cancelStagedSelection = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({
      cancelStagedSelection,
      onUnrelatedNavigation: vi.fn(),
    });

    await lifecycle.runNavigation("import-staging", async () => undefined);
    lifecycle.handleLocationChanged("epubcfi(/6/20)");
    await lifecycle.runNavigation("import-staging", async () => undefined);
    lifecycle.handleLocationChanged("epubcfi(/6/30)");
    lifecycle.handleLocationChanged("epubcfi(/6/30)");

    expect(cancelStagedSelection).not.toHaveBeenCalled();
    lifecycle.handleLocationChanged("epubcfi(/6/20)");
    expect(cancelStagedSelection).toHaveBeenCalledOnce();
  });

  it("preserves staged state during layout reflow", async () => {
    const cancelStagedSelection = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({
      cancelStagedSelection,
      onUnrelatedNavigation: vi.fn(),
    });

    await lifecycle.runNavigation("layout-reflow", async () => {
      lifecycle.handleLocationChanged("epubcfi(/6/40)");
    });

    expect(cancelStagedSelection).not.toHaveBeenCalled();
    lifecycle.handleLocationChanged("epubcfi(/6/40)");
    lifecycle.handleLocationChanged("epubcfi(/6/40)");
    expect(cancelStagedSelection).not.toHaveBeenCalled();
  });

  it("still cancels an ordinary staged selection on an unprotected relocation", () => {
    const cancelStagedSelection = vi.fn();
    const lifecycle = new StagedSelectionLifecycle({
      cancelStagedSelection,
      onUnrelatedNavigation: vi.fn(),
    });

    lifecycle.handleLocationChanged();

    expect(cancelStagedSelection).toHaveBeenCalledOnce();
  });
});
