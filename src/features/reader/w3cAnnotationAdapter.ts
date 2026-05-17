import type { LibraryBook } from "../../schemas/library";
import type { W3CAnnotation, W3CFragmentSelector, W3CTextualBody } from "../../schemas/w3cAnnotation";
import type { LocalHighlight } from "./types";

const EPUB_CFI_CONFORMS_TO = "http://www.idpf.org/epub/linking/cfi/epub-cfi.html";

export function createW3CAnnotationFromLocalHighlight(input: {
  localHighlight: LocalHighlight;
  book: LibraryBook;
  sessionId?: string;
}): W3CAnnotation {
  const now = new Date().toISOString();

  const selector: W3CFragmentSelector = {
    type: "FragmentSelector",
    conformsTo: EPUB_CFI_CONFORMS_TO,
    value: input.localHighlight.cfiRange,
  };

  const sourceId = bestEffortBookSourceId(input.book);

  const textBody: W3CTextualBody = {
    type: "TextualBody",
    purpose: "describing",
    format: "text/plain",
    value: input.localHighlight.text,
  };

  const colorBody: W3CTextualBody = {
    type: "TextualBody",
    purpose: "highlighting",
    format: "text/plain",
    value: input.localHighlight.color ?? "yellow",
  };

  const bodies: W3CTextualBody[] = [textBody, colorBody];
  const motivations: string[] = ["highlighting"];

  if (input.localHighlight.note) {
    bodies.push({
      type: "TextualBody",
      purpose: "commenting",
      format: "text/plain",
      value: input.localHighlight.note,
    });
    motivations.push("commenting");
  }

  return {
    "@context": "http://www.w3.org/ns/anno.jsonld",
    type: "Annotation",
    motivation: motivations.length === 1 ? motivations[0] : motivations,
    created: input.localHighlight.createdAt || now,
    modified: now,
    sessionId: input.sessionId,
    target: {
      source: { id: sourceId, type: "Text" },
      selector,
    },
    body: bodies,
  };
}

function bestEffortBookSourceId(book: LibraryBook): string {
  // TODO: Use server-provided artifact id / epub UID when available.
  return `book:${book.id}`;
}

