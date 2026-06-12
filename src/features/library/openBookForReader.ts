import type { LibraryBook, SecondPassClient } from "@secondpass/client";
import { getReaderReturnTarget, saveReaderReturnTarget } from "../reader/readerReturnTarget";
import type { OpenedBook, ReaderReturnTarget } from "../reader/types";

export async function openBookForReader(input: {
  spl: SecondPassClient;
  book: LibraryBook;
  returnTarget?: ReaderReturnTarget | null;
}): Promise<OpenedBook> {
  const { spl, book } = input;
  const returnTarget = input.returnTarget
    ? saveReaderReturnTarget(book.id, input.returnTarget)
    : getReaderReturnTarget(book.id);

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const opened = await withTimeout(spl.reading.openForReading(book), 120_000, "Opening reading session");
  const objectUrl = URL.createObjectURL(opened.blob);
  return {
    book,
    blob: opened.blob,
    objectUrl,
    openedAt: new Date().toISOString(),
    readingOpen: opened.open,
    returnTarget,
  };
}
