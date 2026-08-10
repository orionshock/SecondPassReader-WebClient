import type { BookDetail, CompactBook, SecondPassClient } from "@secondpass/client";
import { getReaderReturnTarget, saveReaderReturnTarget } from "../reader/ReaderReturnTarget.Store";
import type { OpenedBook, ReaderReturnTarget } from "../reader/Reader.Types";

export async function openBookForReader(input: {
  spl: SecondPassClient;
  book: CompactBook | BookDetail;
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

  const marginaliaBootstrap = await withTimeout(
    spl.marginalia.books.open(String(book.id)),
    120_000,
    "Opening reading session",
  );
  const blob = await withTimeout(spl.library.books.download(book), 120_000, "Downloading book");
  const objectUrl = URL.createObjectURL(blob);
  return {
    book,
    blob,
    objectUrl,
    openedAt: new Date().toISOString(),
    marginaliaBootstrap,
    returnTarget,
  };
}
