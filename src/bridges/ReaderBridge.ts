import type { BookFile, W3CAnnotation } from "@secondpass/client";

export type ReaderLocation = {
  epubCfi: string;
  progression?: number | null;
};

export type TextSelection = {
  epubCfiRange: string;
  text?: string | null;
};

export interface ReaderBridge {
  openBook(input: { book: BookFile; initialLocation?: ReaderLocation | null }): Promise<void>;
  goTo(location: ReaderLocation): Promise<void>;

  onLocationChange(handler: (location: ReaderLocation) => void): () => void;
  onTextSelected(handler: (selection: TextSelection) => void): () => void;

  renderAnnotation(annotation: W3CAnnotation): Promise<void>;
  removeAnnotation(annotationId: string): Promise<void>;
}
