// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CollectionPagination } from "../../components/CollectionPagination.UI";

it("renders page status, total, options, and disabled native buttons", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(
    <CollectionPagination
      page={2}
      total={73}
      pageSize={{ value: 20, options: [20, 50, 100], onChange: vi.fn() }}
      busy={false}
      hasPrevious
      hasNext={false}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      previousAriaLabel="Previous books page"
      nextAriaLabel="Next books page"
    />,
  ));
  expect(container.querySelector(".collectionPagerStatus")?.textContent).toContain("Page 2 of 4");
  expect(container.querySelector(".collectionPagerStatus")?.textContent).toContain("73");
  expect(container.querySelector(".collectionPagerStatus .metaSeparator")).not.toBeNull();
  expect(container.querySelector(".collectionPagerPageSize")?.textContent).toContain("Results per page");
  const labeledSelect = container.querySelector<HTMLSelectElement>(".collectionPagerPageSize select")!;
  expect(labeledSelect.value).toBe("20");
  expect([...labeledSelect.options].map((option) => option.value)).toEqual(["20", "50", "100"]);
  expect(container.querySelector<HTMLButtonElement>('button[aria-label="Previous books page"]')?.disabled).toBe(false);
  expect(container.querySelector<HTMLButtonElement>('button[aria-label="Next books page"]')?.disabled).toBe(true);
  act(() => root.unmount());
});

it("places caller controls before page size and invokes size and page callbacks", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const onChange = vi.fn();
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  act(() => root.render(
    <CollectionPagination
      page={1}
      total={26}
      pageSize={{ value: 20, options: [20, 50, 100], onChange }}
      busy={false}
      hasPrevious={false}
      hasNext
      onPrevious={onPrevious}
      onNext={onNext}
      contextControls={<button type="button" className="facetControl">Shelf A-Z</button>}
      stickyBottom
    />,
  ));
  const context = container.querySelector(".facetControl")!;
  const select = container.querySelector<HTMLSelectElement>(".collectionPagerPageSize select")!;
  const previous = container.querySelector<HTMLButtonElement>(".pagerButtons button")!;
  expect(context.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(select.compareDocumentPosition(previous) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelector(".collectionPagerBottom")).not.toBeNull();
  expect(container.querySelector(".collectionPagerStatus")?.textContent).toContain("Page 1 of 2");
  act(() => {
    select.value = "50";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    container.querySelectorAll<HTMLButtonElement>(".pagerButtons button")[1]!.click();
  });
  expect(onChange).toHaveBeenCalledWith(50);
  expect(onPrevious).not.toHaveBeenCalled();
  expect(onNext).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});

it("shows an existing route page size even when it is outside the offered choices", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(
    <CollectionPagination
      page={1}
      total={30}
      pageSize={{ value: 24, options: [20, 50, 100], onChange: vi.fn() }}
      busy={false}
      hasPrevious={false}
      hasNext
      onPrevious={vi.fn()}
      onNext={vi.fn()}
    />,
  ));
  const select = container.querySelector<HTMLSelectElement>("select")!;
  expect(select.value).toBe("24");
  expect([...select.options].map((option) => option.value)).toEqual(["24", "20", "50", "100"]);
  expect(container.querySelector(".collectionPagerStatus")?.textContent).toContain("Page 1 of 2");
  act(() => root.unmount());
});
