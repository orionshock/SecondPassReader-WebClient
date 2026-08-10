import type { Shelf, SecondPassClient } from "@secondpass/client";

const SHELF_PAGE_SIZE = 100;

export async function loadPersonalShelves(spl: SecondPassClient, book?: string): Promise<Shelf[]> {
  const shelves: Shelf[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const result = await spl.shelves.list({ scope: "personal", book, ordering: "name", page, pageSize: SHELF_PAGE_SIZE });
    shelves.push(...result.results);
    hasNext = Boolean(result.next);
    page += 1;
  }
  return shelves;
}

export async function addBookToPersonalShelf(input: {
  spl: SecondPassClient;
  shelfId: string;
  bookId: string;
}): Promise<{ added: true } | { added: false; message: string }> {
  try {
    await input.spl.shelves.addItem(input.shelfId, { book: input.bookId });
    return { added: true };
  } catch (reason) {
    try {
      const matchingShelves = await loadPersonalShelves(input.spl, input.bookId);
      if (matchingShelves.some((shelf) => String(shelf.id) === input.shelfId)) return { added: true };
    } catch {
      // Preserve the original add error when membership reconciliation also fails.
    }
    return {
      added: false,
      message: reason instanceof Error ? reason.message : "Could not add this book to the shelf.",
    };
  }
}
