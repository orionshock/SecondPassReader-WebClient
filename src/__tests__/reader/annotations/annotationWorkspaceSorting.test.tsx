// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnotationWorkspace } from "../../../features/reader/annotations/AnnotationWorkspacePanel.UI";
import type { CurrentSessionAnnotationViewModel } from "../../../features/reader/annotations/ReaderAnnotationViewModels.Types";
import type { PreviousSessionAnnotationGroup } from "../../../features/reader/session/previousSession/PreviousSessionViewModels.Presenter";

const EARLY = "epubcfi(/6/4[chapter]!/4/4:0)";
const LATE = "epubcfi(/6/4[chapter]!/4/10:0)";

function bookmark(id: string, cfi: string, createdAt: string, updatedAt: string): CurrentSessionAnnotationViewModel {
  return {
    id,
    cfi,
    label: id,
    labelParts: [id],
    timestamp: updatedAt,
    createdAt,
    updatedAt,
    isCurrent: false,
    descriptionStatus: "ready",
  };
}

function previousGroups(): PreviousSessionAnnotationGroup[] {
  return [{
    sessionId: "previous-session",
    label: "Previous session",
    labelParts: ["Previous session"],
    highlightCount: 0,
    selected: true,
    status: "ready",
    items: [
      { kind: "bookmark", id: "previous-late", cfi: LATE, timestamp: "2026-01-03", createdAt: "2026-01-01", updatedAt: "2026-01-03", descriptionStatus: "ready" },
      { kind: "bookmark", id: "previous-early", cfi: EARLY, timestamp: "2026-01-02", createdAt: "2026-01-02", updatedAt: "2026-01-02", descriptionStatus: "ready" },
    ],
  }];
}

describe("AnnotationWorkspace sorting", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(annotations: CurrentSessionAnnotationViewModel[]) {
    act(() => root.render(
      <AnnotationWorkspace
        annotations={annotations}
        status="ready"
        error={null}
        busy={false}
        previousSessionGroups={previousGroups()}
        onRemoveAnnotation={vi.fn()}
        onUpdateHighlight={vi.fn().mockResolvedValue(undefined)}
        onJumpToCfi={vi.fn()}
        onJumpToCfiRange={vi.fn()}
      />,
    ));
  }

  function visibleIds(): string[] {
    return [...host.querySelectorAll<HTMLElement>("[data-annotation-id]")].map((element) => element.dataset.annotationId!);
  }

  function selectSort(value: string) {
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Sort annotations"]')!;
    act(() => {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("shares one selected sort across tabs and derives fresh order after add, update, and delete", () => {
    const early = bookmark("current-early", EARLY, "2026-01-01", "2026-01-02");
    const late = bookmark("current-late", LATE, "2026-01-02", "2026-01-03");
    render([early, late]);
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Sort annotations"]')?.value).toBe("created");
    expect(visibleIds()).toEqual(["current-late", "current-early"]);

    selectSort("location");
    expect(visibleIds()).toEqual(["current-early", "current-late"]);
    act(() => host.querySelector<HTMLButtonElement>("#annotation-previous-tab")!.click());
    expect(visibleIds()).toEqual(["previous-early", "previous-late"]);
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Sort annotations"]')?.value).toBe("location");

    act(() => host.querySelector<HTMLButtonElement>("#annotation-current-tab")!.click());
    const middle = bookmark("current-middle", "epubcfi(/6/4[chapter]!/4/8:0)", "2026-01-04", "2026-01-04");
    render([late, middle, early]);
    expect(visibleIds()).toEqual(["current-early", "current-middle", "current-late"]);
    render([{ ...early, updatedAt: "2026-01-05" }, late]);
    expect(visibleIds()).toEqual(["current-early", "current-late"]);

    selectSort("updated");
    expect(visibleIds()).toEqual(["current-early", "current-late"]);
  });
});
