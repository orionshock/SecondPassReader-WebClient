import { describe, expect, it } from "vitest";

import { glaspCsvImportHandler } from "../../../features/reader/imports/handlers/glaspCsv/GlaspCsvImport.Handler";

describe("Glasp CSV HTML entity decoding", () => {
  it.each([
    ["&ldquo;text&rdquo;", "\u201ctext\u201d"],
    [`Don&rsquo;t ${entity("mdash")} wait ${entity("ndash")} go`, "Don\u2019t \u2014 wait \u2013 go"],
    [`Wait${entity("hellip")}`, "Wait\u2026"],
    ["AT&amp;T", "AT&T"],
    ["&#8220;text&#8221;", "\u201ctext\u201d"],
    ["&#x201C;text&#x201D;", "\u201ctext\u201d"],
  ])("decodes quote text entities in %s", async (source, expected) => {
    const row = await importSingleRow(source);

    expect(row.quoteText).toBe(expected);
  });

  it("decodes entities in note text", async () => {
    const row = await importSingleRow("Quote", `Don&rsquo;t stop${entity("hellip")}`);

    expect(row.noteText).toBe("Don\u2019t stop\u2026");
  });

  it("leaves unknown and invalid entities unchanged", async () => {
    const row = await importSingleRow("Keep &unknown; &#x110000; &#55296; &#0;");

    expect(row.quoteText).toBe("Keep &unknown; &#x110000; &#55296; &#0;");
  });

  it("does not decode the Glasp location/CFI hint", async () => {
    const row = await importSingleRow("Quote", "Note", "epubcfi(/6/2)&amp;location=3");

    expect(row.cfiHint).toBe("epubcfi(/6/2)&amp;location=3");
  });
});

async function importSingleRow(quoteText: string, noteText = "", location = "") {
  const csv = [
    "Highlight Text,Note,Location",
    [quoteText, noteText, location].map(csvCell).join(","),
  ].join("\n");
  const file = new File([csv], "glasp.csv", { type: "text/csv" });
  const job = await glaspCsvImportHandler.importFile(file);

  expect(job.rows).toHaveLength(1);
  return job.rows[0]!;
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function entity(name: string): string {
  return `&${name};`;
}
