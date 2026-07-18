import { describe, expect, it, vi } from "vitest";
import { loadServerPresets, parseServerPresets } from "../features/connection/serverPresets";

describe("server presets", () => {
  it("normalizes valid entries and rejects invalid entries", () => {
    expect(parseServerPresets([
      { name: " Production Library ", url: " https://library.example.com " },
      { name: "", url: "https://invalid.example.com" },
      { name: "Missing URL" },
    ])).toEqual([{ name: "Production Library", url: "https://library.example.com" }]);
  });

  it("loads a valid preset file", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ name: "Production Library", url: "https://library.example.com" }],
    });
    await expect(loadServerPresets(fetcher)).resolves.toEqual([
      { name: "Production Library", url: "https://library.example.com" },
    ]);
  });

  it("falls back for missing or invalid preset files", async () => {
    await expect(loadServerPresets(vi.fn().mockResolvedValue({ ok: false }))).resolves.toEqual([]);
    await expect(loadServerPresets(vi.fn().mockRejectedValue(new Error("missing")))).resolves.toEqual([]);
    await expect(loadServerPresets(vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("invalid"); } })))
      .resolves.toEqual([]);
  });
});
