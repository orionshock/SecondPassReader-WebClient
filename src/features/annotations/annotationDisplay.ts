import type { ReadingAnnotation } from "../../schemas/readingSession";

export function getAnnotationDisplay(annotation: ReadingAnnotation): { icon: string; label: string } {
  const rawMotivation = (annotation as any)?.motivation;
  const motivations: string[] = Array.isArray(rawMotivation)
    ? rawMotivation.filter((x): x is string => typeof x === "string")
    : typeof rawMotivation === "string"
      ? [rawMotivation]
      : [];

  const bodies = (annotation as any)?.body;
  const hasTextBody =
    Array.isArray(bodies) &&
    bodies.some((b) => b && typeof b === "object" && ((b as any).type === "TextualBody" || typeof (b as any).value === "string"));

  const isHighlight = motivations.includes("highlighting");
  const isComment = motivations.includes("commenting");

  if (isHighlight && hasTextBody) return { icon: "✎", label: "Highlight + note" };
  if (isHighlight) return { icon: "✦", label: "Highlight" };
  if (isComment || hasTextBody) return { icon: "🗒", label: "Note" };
  return { icon: "🔖", label: "Bookmark" };
}

