// @vitest-environment jsdom
import { EpubCFI } from "@likecoin/epub-ts";
import { describe, expect, it } from "vitest";
import { assertDurableReaderCfi } from "../../../features/reader/domain/DurableReaderCfi.Policy";
import { buildHighlightUpsert, buildMarginaliaProgressInput } from "../../../features/reader/session/ReadingSessionMarginalia.Actions";
import { buildOfflineReadingProgress } from "../../../features/reader/session/progress/OfflineReadingProgress.Controller";

describe("durable EPUB CFI profile", () => {
  it("accepts actual epub-ts point and range output with structural element IDs", () => {
    document.body.innerHTML = '<p id="paragraph">Alpha beta gamma</p>';
    const text = document.querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 10);
    const point = document.createRange();
    point.setStart(text, 4);
    point.collapse(true);

    const pointCfi = new EpubCFI(point, "/6/4[chapter]").toString();
    const rangeCfi = new EpubCFI(range, "/6/4[chapter]").toString();
    expect(pointCfi).toBe("epubcfi(/6/4[chapter]!/4/2[paragraph]/1:4)");
    expect(rangeCfi).toBe("epubcfi(/6/4[chapter]!/4/2[paragraph],/1:6,/1:10)");
    expect(() => assertDurableReaderCfi(pointCfi)).not.toThrow();
    expect(() => assertDurableReaderCfi(rangeCfi)).not.toThrow();
    expect(buildMarginaliaProgressInput(pointCfi).location).toBe(pointCfi);
    expect(buildOfflineReadingProgress({ location: { cfi: pointCfi }, toc: null })?.location).toBe(pointCfi);
    expect(buildHighlightUpsert({ clientId: "highlight", cfi: rangeCfi, text: "beta", prefix: "Alpha ", suffix: " gamma", color: "yellow" }))
      .toMatchObject({ annotation: { location: { location: rangeCfi }, body: { text: "beta", prefix: "Alpha", suffix: "gamma" } } });
  });

  it("accepts historical-style structural IDs and rejects text assertions and other unsupported offsets", () => {
    const historical = "epubcfi(/6/34!/4[x9780451492128_EPUB-15]/2,/310/1:0,/314/1:17)";
    expect(() => assertDurableReaderCfi(historical)).not.toThrow();
    expect(() => assertDurableReaderCfi("epubcfi(/6/4!/4[element-id]/1:17)")).not.toThrow();
    expect(buildHighlightUpsert({ clientId: "imported", cfi: historical, text: "quote", color: "yellow" }))
      .toMatchObject({ annotation: { location: { location: historical } } });
    for (const unsupported of [
      "epubcfi(/6/4!/4/1:17[surrounding text])",
      "epubcfi(/6/4!/4/1:17~5)",
      "epubcfi(/6/4!/4/1:17@20:30)",
      "epubcfi(/6/4!/4/1:17;s=after)",
    ]) expect(() => assertDurableReaderCfi(unsupported)).toThrow(/unsupported/);
    expect(() => buildHighlightUpsert({ clientId: "bad", cfi: "epubcfi(/6/4!/4/1:17[quote])", text: "quote", color: "yellow" }))
      .toThrow(/unsupported/);
    expect(() => buildOfflineReadingProgress({ location: { cfi: "epubcfi(/6/4!/4/1:17[quote])" }, toc: null }))
      .toThrow(/unsupported/);
  });
});
