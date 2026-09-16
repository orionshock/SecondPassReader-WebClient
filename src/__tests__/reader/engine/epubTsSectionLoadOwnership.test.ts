import type { Section } from "@likecoin/epub-ts";
import { describe, expect, it, vi } from "vitest";
import { createEpubTsSectionLoadController } from "../../../features/reader/engine/EpubTsSectionLoad.Controller";

describe("epub-ts Section load ownership", () => {
  it("keeps a Section loaded when an upstream locations owner unloads before application access completes", async () => {
    const section = fakeSection();
    const controller = createEpubTsSectionLoadController([section]);
    await section.load(); // Simulates epub-ts locations generation.
    const releaseApplication = deferred<void>();
    const applicationStarted = deferred<void>();
    const application = controller.withSection(section, undefined, async () => {
      applicationStarted.resolve();
      await releaseApplication.promise;
      expect(section.document).toBeDefined();
    });
    await applicationStarted.promise;

    section.unload(); // Locations completes first.
    expect(section.document).toBeDefined();
    releaseApplication.resolve();
    await application;

    expect(section.document).toBeUndefined();
  });

  it("keeps a Section loaded when application access ends before an upstream owner", async () => {
    const section = fakeSection();
    const controller = createEpubTsSectionLoadController([section]);
    await section.load();

    await controller.withSection(section, undefined, () => {
      expect(section.document).toBeDefined();
    });

    expect(section.document).toBeDefined();
    section.unload();
    expect(section.document).toBeUndefined();
  });

  it("preserves a Section that was already loaded when ownership was installed", async () => {
    const section = fakeSection(true);
    const controller = createEpubTsSectionLoadController([section]);

    await controller.withSection(section, undefined, () => undefined);

    expect(section.document).toBeDefined();
    section.unload();
    expect(section.document).toBeUndefined();
  });

  it("releases temporary ownership after operation failure or cancellation", async () => {
    const failed = fakeSection();
    const failedController = createEpubTsSectionLoadController([failed]);
    await expect(failedController.withSection(failed, undefined, () => {
      throw new Error("range failed");
    })).rejects.toThrow("range failed");
    expect(failed.document).toBeUndefined();

    const cancelled = fakeSection();
    const cancelledController = createEpubTsSectionLoadController([cancelled]);
    await expect(cancelledController.withSection(cancelled, undefined, () => {
      throw new DOMException("cancelled", "AbortError");
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled.document).toBeUndefined();
  });

  it("releases a failed load and restores original methods at teardown", async () => {
    const section = fakeSection();
    const originalLoad = section.load;
    const originalUnload = section.unload;
    vi.mocked(originalLoad).mockRejectedValueOnce(new Error("load failed"));
    const controller = createEpubTsSectionLoadController([section]);

    await expect(controller.withSection(section, undefined, () => undefined)).rejects.toThrow("load failed");
    expect(section.document).toBeUndefined();
    controller.destroy();

    expect(section.load).toBe(originalLoad);
    expect(section.unload).toBe(originalUnload);
  });
});

function fakeSection(initiallyLoaded = false): Section {
  const initialDocument = initiallyLoaded ? {} as Document : undefined;
  const section = {
    document: initialDocument,
    contents: initiallyLoaded ? {} as Element : undefined,
    load: vi.fn(async function (this: Section) {
      this.document = {} as Document;
      this.contents = {} as Element;
      return this.contents;
    }),
    unload: vi.fn(function (this: Section) {
      this.document = undefined;
      this.contents = undefined;
    }),
  };
  return section as unknown as Section;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
