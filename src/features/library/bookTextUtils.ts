import type { LibraryBook } from "@secondpass/client";

function decodeBasicEntities(text: string): string {
  return text
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replace(/&#(\d+);/g, (_m, num) => {
      const n = Number(num);
      if (!Number.isFinite(n)) return "";
      try {
        return String.fromCodePoint(n);
      } catch {
        return "";
      }
    });
}

function stripHtmlToText(input: string): string {
  // Handle common line-breaking tags first so paragraphs don't mash together.
  let t = input.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  t = t.replace(/<\s*\/\s*p\s*>/gi, "\n");
  t = t.replace(/<\s*p(\s+[^>]*)?>/gi, "");
  t = t.replace(/<\s*\/\s*div\s*>/gi, "\n");
  t = t.replace(/<\s*div(\s+[^>]*)?>/gi, "");

  // Strip remaining tags.
  t = t.replace(/<[^>]+>/g, "");

  // Decode a few common entities.
  t = decodeBasicEntities(t);

  // Normalize whitespace a bit.
  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/[ \t]{2,}/g, " ");
  return t.trim();
}

export function getBookDescriptionText(book: Pick<LibraryBook, "description"> | null | undefined): string | undefined {
  if (!book) return undefined;
  const raw = (book.description ?? "").trim();
  if (!raw) return undefined;
  const text = stripHtmlToText(raw);
  return text ? text : undefined;
}
