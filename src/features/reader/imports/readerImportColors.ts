import {
  ANNOTATION_COLOR_TOKENS,
  type AnnotationColorToken,
} from "../display/ReaderAnnotation.Presenter";

const ANNOTATION_COLOR_TOKEN_SET = new Set<string>(ANNOTATION_COLOR_TOKENS);

const GLASP_COLOR_MAP: Record<string, AnnotationColorToken> = {
  blue: "blue",
  green: "green",
  pink: "pink",
  purple: "purple",
  red: "pink",
  yellow: "yellow",
  orange: "orange",
};

export function normalizeImportedHighlightColor(color: string | undefined): AnnotationColorToken | undefined {
  const key = color?.trim().toLowerCase();
  if (!key) return undefined;
  if (key.includes("blue")) return "blue";
  if (key.includes("green")) return "green";
  if (key.includes("pink") || key.includes("red")) return "pink";
  if (key.includes("purple") || key.includes("violet")) return "purple";
  if (key.includes("orange")) return "orange";
  if (key.includes("yellow")) return "yellow";
  if (ANNOTATION_COLOR_TOKEN_SET.has(key)) return key as AnnotationColorToken;
  return GLASP_COLOR_MAP[key];
}
