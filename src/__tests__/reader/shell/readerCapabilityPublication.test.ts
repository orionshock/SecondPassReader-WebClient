import { describe, expect, it, vi } from "vitest";
import type { ReaderRendererCapability } from "../../../features/reader/domain/ReaderBridge.Types";
import { ReaderBootstrapProgressGuard } from "../../../features/reader/shell/ReaderBootstrapProgressGuard.State";
import { ReaderCapabilityPublicationLifecycle } from "../../../features/reader/shell/ReaderCapabilityPublication.Lifecycle";

describe("Reader capability publication", () => {
  it("publishes one coherent capability and withdraws it together", async () => {
    const publications: Array<Omit<ReaderRendererCapability, "stagedSelection"> | null> = [];
    const engine = rendererEngine();
    const lifecycle = publicationLifecycle(publications);

    lifecycle.publish(engine as never, 4, () => true);

    const capability = publications.at(-1);
    expect(capability).toEqual(expect.objectContaining({
      describeCfi: expect.any(Function),
      probeCfi: expect.any(Function),
      displayCfi: expect.any(Function),
      searchBook: expect.any(Function),
    }));
    await capability?.describeCfi("epubcfi(/6/4)");
    await capability?.searchBook("query");
    expect(engine.describeCfi).toHaveBeenCalledWith("epubcfi(/6/4)");
    expect(engine.searchBook).toHaveBeenCalledWith("query", undefined);

    lifecycle.unpublish();
    expect(publications.at(-1)).toBeNull();
  });

  it("rejects work retained from an obsolete engine generation", async () => {
    const publications: Array<Omit<ReaderRendererCapability, "stagedSelection"> | null> = [];
    const engine = rendererEngine();
    let current = true;
    const lifecycle = publicationLifecycle(publications);
    lifecycle.publish(engine as never, 7, () => current);
    const capability = publications.at(-1)!;

    current = false;
    await expect(capability?.describeCfi("epubcfi(/6/8)")).rejects.toThrow("not ready");
    await expect(capability?.searchBook("query")).rejects.toThrow("not ready");
    await expect(capability?.displayCfi("epubcfi(/6/8)")).resolves.toMatchObject({ ok: false });
    await expect(capability?.probeCfi("epubcfi(/6/8)")).resolves.toMatchObject({ ok: false });
    expect(engine.describeCfi).not.toHaveBeenCalled();
    expect(engine.searchBook).not.toHaveBeenCalled();
    expect(engine.displayCfiSafely).not.toHaveBeenCalled();
    expect(engine.probeCfi).not.toHaveBeenCalled();
  });
});

function publicationLifecycle(publications: Array<Omit<ReaderRendererCapability, "stagedSelection"> | null>) {
  return new ReaderCapabilityPublicationLifecycle({
    bootstrapProgressGuard: new ReaderBootstrapProgressGuard(),
    runtimeController: {
      run: ({ run }: { run: (input: { engine: ReturnType<typeof rendererEngine> }) => Promise<unknown> }) => run({ engine: rendererEngine() }),
    } as never,
    stagedSelectionLifecycle: {
      runNavigation: (_intent: string, operation: () => Promise<unknown>) => operation(),
    } as never,
    onRendererCapabilityReady: (capability) => publications.push(capability),
  });
}

function rendererEngine() {
  return {
    describeCfi: vi.fn(async () => ({ cfi: "epubcfi(/6/4)" })),
    probeCfi: vi.fn(async () => ({ ok: true })),
    displayCfiSafely: vi.fn(async () => ({ ok: true })),
    searchBook: vi.fn(async () => []),
  };
}
