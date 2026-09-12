export const ANNOTATION_COLOR_TOKENS = ["yellow", "green", "blue", "pink", "purple", "orange"] as const;

export type AnnotationColorToken = (typeof ANNOTATION_COLOR_TOKENS)[number];
