export type Book = {
  id: string;
  title: string;
  authors?: string[];
  language?: string | null;
  coverImageUrl?: string | null;
};

export type BookFile = {
  bookId: string;
  mimeType: "application/epub+zip" | string;
  url: string;
  // Some servers may provide a direct blob/arrayBuffer later; keep URL-first for now.
};

