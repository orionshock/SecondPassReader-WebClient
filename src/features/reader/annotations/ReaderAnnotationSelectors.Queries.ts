import type { MarginaliaAnnotation } from "@secondpass/client";

export function isBookmarkAnnotation(annotation: MarginaliaAnnotation): boolean { return annotation.kind === "bookmark"; }

export function isHighlightAnnotation(annotation: MarginaliaAnnotation): boolean { return annotation.kind === "highlight"; }
export function isCommentAnnotation(annotation: MarginaliaAnnotation): boolean { return annotation.kind === "highlight" && Boolean(annotation.body.note); }

export function getAnnotationFragmentCfi(annotation: MarginaliaAnnotation): string | null { return annotation.location.cfi || null; }
