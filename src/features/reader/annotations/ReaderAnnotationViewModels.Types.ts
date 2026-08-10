import type { ReaderBookmarkViewModel } from "./ReaderBookmark.Mapper";

export type HighlightViewModel = {
  kind: "highlight";
  id: string;
  cfiRange: string;
  text: string;
  note?: string;
  color?: string;
  timestamp?: string;
  label: string;
  labelParts: string[];
  descriptionStatus: "idle" | "loading" | "ready" | "error";
};

export type CurrentSessionAnnotationViewModel = ReaderBookmarkViewModel | HighlightViewModel;
