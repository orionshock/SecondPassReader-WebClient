// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfflinePublicationCoverImage } from "../../../app/offline/publication/OfflinePublicationCoverImage.UI";

let container: HTMLDivElement;
let root: Root;

describe("offline publication cover image", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("replaces and revokes local Blob URLs", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const first = new Blob(["first"], { type: "image/jpeg" });
    const second = new Blob(["second"], { type: "image/png" });

    await render(first);
    expect(container.querySelector("img")?.src).toBe("blob:first");

    await render(second);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    expect(container.querySelector("img")?.src).toBe("blob:second");

    act(() => root.unmount());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second");
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    root = createRoot(container);
  });
});

async function render(blob: Blob): Promise<void> {
  await act(async () => {
    root.render(
      <OfflinePublicationCoverImage
        blob={blob}
        alt="Book cover"
        imageClassName="cover"
        placeholderClassName="placeholder"
      />,
    );
  });
}
