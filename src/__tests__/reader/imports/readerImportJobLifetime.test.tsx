// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { useReaderImportJob } from "../../../features/reader/imports/ReaderImportJob.Controller";

describe("reader import job lifetime", () => {
  it("invalidates activation when unrelated Reader navigation resets staged rows", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const root = createRoot(document.createElement("div"));
    let jobController: ReturnType<typeof useReaderImportJob> | null = null;

    function Harness() {
      jobController = useReaderImportJob();
      return null;
    }

    await act(async () => root.render(<Harness />));
    if (!jobController) throw new Error("Import job controller did not mount.");
    const controller = jobController as ReturnType<typeof useReaderImportJob>;
    const activation = controller.reviewLifetime.beginActivation("job-a", "row-1", () => true);

    act(() => controller.cancelStagedRowsForNavigation());

    expect(activation.signal.aborted).toBe(true);
    expect(activation.isCurrent()).toBe(false);
    act(() => root.unmount());
  });
});
