import type { ReaderBookmarkViewModel } from "./ReaderBookmark.Presenter";

export type HighlightViewModel = {
  kind: "highlight";
  id: string;
  clientId: string;
  cfiRange: string;
  text: string;
  note?: string;
  color?: string;
  timestamp?: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  labelParts: string[];
  descriptionStatus: "idle" | "loading" | "ready" | "error";
};

export type CurrentSessionAnnotationViewModel = ReaderBookmarkViewModel | HighlightViewModel;
