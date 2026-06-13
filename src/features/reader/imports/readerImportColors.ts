import type { ReaderHighlightColor } from "./readerImportTypes";

const GLASP_COLOR_MAP: Record<string, ReaderHighlightColor> = {
  blue: "blue",
  green: "green",
  pink: "pink",
  purple: "purple",
  red: "pink",
  yellow: "yellow",
};

export function normalizeImportedHighlightColor(color: string | undefined): ReaderHighlightColor | undefined {
  const key = color?.trim().toLowerCase();
  if (!key) return undefined;
  if (key.includes("blue")) return "blue";
  if (key.includes("green")) return "green";
  if (key.includes("pink") || key.includes("red")) return "pink";
  if (key.includes("purple") || key.includes("violet")) return "purple";
  if (key.includes("yellow") || key.includes("orange")) return "yellow";
  return GLASP_COLOR_MAP[key];
}
