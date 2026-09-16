import { Locations, type Section, type Spine } from "@likecoin/epub-ts";
import { describe, expect, it, vi } from "vitest";

function createLocations(): Locations {
  return new Locations({} as Spine, async () => undefined);
}

function createSection(load: () => Promise<Element>): Section {
  return {
    cfiBase: "/6/2[chapter]",
    load: vi.fn(load),
    unload: vi.fn(),
  } as unknown as Section;
}

describe("patched epub-ts location generation cleanup", () => {
  it("preserves successful character-location generation", async () => {
    const section = createSection(async () => ({}) as Element);
    const locations = createLocations();
    vi.spyOn(locations, "parse").mockReturnValue(["epubcfi(/6/2!/4/2:0)"]);

    await expect(locations.process(section)).resolves.toEqual(["epubcfi(/6/2!/4/2:0)"]);

    expect(locations._locations).toEqual(["epubcfi(/6/2!/4/2:0)"]);
    expect(section.unload).toHaveBeenCalledOnce();
  });

  it("unloads a successfully loaded section when character parsing fails", async () => {
    const section = createSection(async () => ({}) as Element);
    const locations = createLocations();
    vi.spyOn(locations, "parse").mockImplementation(() => {
      throw new Error("parse failed");
    });

    await expect(locations.process(section)).rejects.toThrow("parse failed");

    expect(section.unload).toHaveBeenCalledOnce();
  });

  it("unloads a successfully loaded section when word parsing fails", async () => {
    const section = createSection(async () => ({}) as Element);
    const locations = createLocations();
    vi.spyOn(locations, "parseWords").mockImplementation(() => {
      throw new Error("word parse failed");
    });

    await expect(locations.processWords(section, 10)).rejects.toThrow("word parse failed");

    expect(section.unload).toHaveBeenCalledOnce();
  });

  it("does not unload when section loading never succeeds", async () => {
    const section = createSection(async () => {
      throw new Error("load failed");
    });
    const locations = createLocations();

    await expect(locations.process(section)).rejects.toThrow("load failed");

    expect(section.unload).not.toHaveBeenCalled();
  });
});
