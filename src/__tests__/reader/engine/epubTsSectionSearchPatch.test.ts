import { afterEach, describe, expect, it, vi } from "vitest";
import { Section } from "@likecoin/epub-ts";

type SearchTextNode = {
  length: number;
  textContent: string;
};

function createSearchSection(texts: string[]): Section {
  const nodes: SearchTextNode[] = texts.map((textContent) => ({
    length: textContent.length,
    textContent,
  }));
  let nodeIndex = 0;
  const range = {
    setEnd: vi.fn(),
    setStart: vi.fn(),
  };
  const documentStub = {
    createRange: () => range,
    createTreeWalker: () => ({
      nextNode: () => nodes[nodeIndex++] ?? null,
    }),
  };

  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });

  const section = new Section({
    canonical: "chapter.xhtml",
    cfiBase: "/6/2[chapter]",
    href: "chapter.xhtml",
    idref: "chapter",
    index: 0,
    linear: "yes",
    next: () => undefined,
    prev: () => undefined,
    properties: [],
    url: "chapter.xhtml",
  });
  section.document = documentStub as unknown as Document;
  vi.spyOn(section, "cfiFromRange").mockReturnValue("epubcfi(tail-match)");

  return section;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("patched epub-ts Section.search tail windows", () => {
  it("finds a query beginning in the final residual text node", () => {
    const section = createSearchSection(["alpha ", "middle ", "tail target"]);

    const results = section.search("tail target", 3);

    expect(results).toEqual([
      {
        cfi: "epubcfi(tail-match)",
        excerpt: "tail target",
      },
    ]);
  });

  it("does not duplicate a match from a previously searched full window", () => {
    const section = createSearchSection(["target ", "middle ", "tail"]);

    const results = section.search("target", 3);

    expect(results).toHaveLength(1);
  });
});
