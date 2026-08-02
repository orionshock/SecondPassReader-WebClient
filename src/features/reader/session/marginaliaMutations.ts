import type {
  MarginaliaAnnotationBatchOperation,
  MarginaliaHighlight,
  MarginaliaHighlightColor,
  MarginaliaProgressInput,
} from "@secondpass/client";

export function toMarginaliaLocationLabel(value: string | null | undefined): string {
  return (value ?? "").slice(0, 255);
}

export function buildMarginaliaProgressInput(cfi: string, locationLabel?: string): MarginaliaProgressInput {
  return { cfi, locationLabel: toMarginaliaLocationLabel(locationLabel) };
}

export function buildBookmarkUpsert(input: {
  clientId: string;
  cfi: string;
  locationLabel?: string;
}): MarginaliaAnnotationBatchOperation {
  return {
    action: "upsert",
    annotation: {
      clientId: input.clientId,
      kind: "bookmark",
      location: { cfi: input.cfi, locationLabel: toMarginaliaLocationLabel(input.locationLabel) },
    },
  };
}

export function buildHighlightUpsert(input: {
  clientId: string;
  cfi: string;
  locationLabel?: string;
  text: string;
  prefix?: string;
  suffix?: string;
  color: MarginaliaHighlightColor;
  note?: string;
}): MarginaliaAnnotationBatchOperation {
  return {
    action: "upsert",
    annotation: {
      clientId: input.clientId,
      kind: "highlight",
      location: { cfi: input.cfi, locationLabel: toMarginaliaLocationLabel(input.locationLabel) },
      body: {
        text: input.text,
        prefix: input.prefix ?? "",
        suffix: input.suffix ?? "",
        color: input.color,
        note: input.note ?? "",
      },
    },
  };
}

export function buildHighlightUpdate(annotation: MarginaliaHighlight, input: {
  color: MarginaliaHighlightColor;
  note: string;
}): MarginaliaAnnotationBatchOperation {
  return {
    action: "upsert",
    annotation: {
      clientId: annotation.clientId,
      kind: "highlight",
      location: annotation.location,
      body: { ...annotation.body, color: input.color, note: input.note },
    },
  };
}
