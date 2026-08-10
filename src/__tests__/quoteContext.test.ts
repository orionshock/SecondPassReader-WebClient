import { describe, expect, it } from "vitest";
import { buildQuoteContext } from "../features/reader/selection/ReaderQuoteContext.Policy";

describe("buildQuoteContext", () => {
  it("keeps exact unchanged and targets ~500 total for short selections", () => {
    const exact = "hello".repeat(20); // 100 chars
    const before = "b".repeat(400);
    const after = "a".repeat(400);
    const out = buildQuoteContext({ exact, before, after });
    expect(out.exact).toBe(exact);
    expect(out.prefix?.length).toBeLessThanOrEqual(500);
    expect(out.suffix?.length).toBeLessThanOrEqual(500);
    // Remaining = 400 => each ~200
    expect(out.prefix?.length).toBe(200);
    expect(out.suffix?.length).toBe(200);
  });

  it("caps prefix/suffix to 500 each", () => {
    const exact = "x".repeat(10);
    const before = "b".repeat(1000);
    const after = "a".repeat(1000);
    const out = buildQuoteContext({ exact, before, after });
    expect(out.prefix?.length).toBeLessThanOrEqual(500);
    expect(out.suffix?.length).toBeLessThanOrEqual(500);
  });

  it("uses smaller halo for long selections and does not truncate exact", () => {
    const exact = "x".repeat(2000);
    const before = "b".repeat(500);
    const after = "a".repeat(500);
    const out = buildQuoteContext({ exact, before, after });
    expect(out.exact.length).toBe(2000);
    // halo = 200, each ~100
    expect(out.prefix?.length).toBe(100);
    expect(out.suffix?.length).toBe(100);
  });
});
