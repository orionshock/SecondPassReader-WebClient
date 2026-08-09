import { describe, expect, it } from "vitest";

import { isStagedToolbarReanchorRequestCurrent } from "../features/reader/shell/useStagedSelectionToolbar";

describe("staged toolbar re-anchor requests", () => {
  it("accepts only the newest measurement for the currently staged CFI", () => {
    expect(isStagedToolbarReanchorRequestCurrent(3, 3, "cfi-new", "cfi-new")).toBe(true);
    expect(isStagedToolbarReanchorRequestCurrent(2, 3, "cfi-new", "cfi-new")).toBe(false);
    expect(isStagedToolbarReanchorRequestCurrent(3, 3, "cfi-old", "cfi-new")).toBe(false);
  });
});
