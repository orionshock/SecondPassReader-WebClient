import { describe, expect, it } from "vitest";
import {
  isReaderFullyReady,
  toReaderViewportStatus,
} from "../features/reader/shell/ReaderReadiness.State";

describe("reader readiness state", () => {
  it("keeps an attached engine in the loading viewport state", () => {
    expect(isReaderFullyReady("engine-attached")).toBe(false);
    expect(toReaderViewportStatus("engine-attached")).toBe("loading");
  });

  it("enables fully ready behavior only after readable display readiness", () => {
    expect(isReaderFullyReady("ready")).toBe(true);
    expect(toReaderViewportStatus("ready")).toBe("ready");
  });

  it("preserves fatal readiness state for viewport rendering", () => {
    expect(isReaderFullyReady("error")).toBe(false);
    expect(toReaderViewportStatus("error")).toBe("error");
  });
});
