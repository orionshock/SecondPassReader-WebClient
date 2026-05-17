import type { ReadingAnnotationCreatePayload } from "../../schemas/readingSession";
import type { LocalHighlight } from "./types";

const EPUB_CFI_CONFORMS_TO = "http://www.idpf.org/epub/linking/cfi/epub-cfi.html";

export function createServerAnnotationPayloadFromLocalHighlight(input: {
  localHighlight: LocalHighlight;
  sessionId: string;
  profileVersion?: string;
}): ReadingAnnotationCreatePayload {
  const note = input.localHighlight.note?.trim() ?? "";
  const motivation = note ? "commenting" : "highlighting";
  const color = input.localHighlight.color ?? "yellow";

  const body: ReadingAnnotationCreatePayload["body"] = [
    {
      type: "TextualBody",
      purpose: "highlighting",
      value: input.localHighlight.text,
      color,
    },
  ];

  if (note) {
    body.push({
      type: "TextualBody",
      purpose: "commenting",
      value: note,
    });
  }

  return {
    profile_version: input.profileVersion ?? "0.1.0",
    session: input.sessionId,
    motivation,
    target: {
      selector: {
        type: "FragmentSelector",
        conformsTo: EPUB_CFI_CONFORMS_TO,
        value: input.localHighlight.cfiRange,
      },
    },
    body,
  };
}

