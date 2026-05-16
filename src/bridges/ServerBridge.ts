import type { Book, BookFile } from "../schemas/library";
import type { ReadingSession } from "../schemas/readingSession";
import type { W3CAnnotation } from "../schemas/w3cAnnotation";

export type ServerMe = {
  id: string;
  email?: string | null;
  displayName?: string | null;
};

export type ListResult<T> = {
  items: T[];
  nextCursor?: string | null;
};

export interface ServerBridge {
  getMe(): Promise<ServerMe>;

  listBooks(options?: { cursor?: string | null; pageSize?: number }): Promise<ListResult<Book>>;
  getBook(bookId: string): Promise<Book>;
  getBookFile(bookId: string): Promise<BookFile>;

  getActiveSession(bookId: string): Promise<ReadingSession | null>;
  updateCurrentLocation(input: {
    sessionId: string;
    epubCfi: string;
    progression?: number | null;
  }): Promise<ReadingSession>;

  listAnnotations(options: {
    bookId: string;
    sessionId?: string | null;
    cursor?: string | null;
    pageSize?: number;
  }): Promise<ListResult<W3CAnnotation>>;
  createAnnotation(input: { annotation: W3CAnnotation }): Promise<W3CAnnotation>;
  updateAnnotation(input: { annotationId: string; patch: Partial<W3CAnnotation> }): Promise<W3CAnnotation>;
  deleteAnnotation(annotationId: string): Promise<void>;
}

