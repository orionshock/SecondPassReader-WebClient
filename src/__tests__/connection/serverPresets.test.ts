import { describe, expect, it, vi } from "vitest";
import { loadServerPresets, parseServerPresets } from "../../features/connection/ServerPresets.Queries";

describe("server presets", () => {
  it("normalizes valid entries and rejects invalid entries", () => {
    expect(parseServerPresets([
      " https://library.example.com ",
      "http://localhost:8000",
      "",
      { url: "https://object.example.com" },
    ])).toEqual([
      { url: "https://library.example.com" },
      { url: "http://localhost:8000" },
    ]);
  });

  it("loads a valid preset file", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ["https://library.example.com"],
    });
    await expect(loadServerPresets(fetcher)).resolves.toEqual([
      { url: "https://library.example.com" },
    ]);
  });

  it("falls back for missing or invalid preset files", async () => {
    await expect(loadServerPresets(vi.fn().mockResolvedValue({ ok: false }))).resolves.toEqual([]);
    await expect(loadServerPresets(vi.fn().mockRejectedValue(new Error("missing")))).resolves.toEqual([]);
    await expect(loadServerPresets(vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("invalid"); } })))
      .resolves.toEqual([]);
  });
});
