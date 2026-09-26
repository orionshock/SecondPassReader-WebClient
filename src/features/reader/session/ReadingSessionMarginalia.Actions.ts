import type { CurrentSessionAnnotationMutation } from "./annotations/CurrentSessionAnnotation.Types";
import { assertDurableReaderCfi } from "../domain/DurableReaderCfi.Policy";
import type {
  MarginaliaAnnotation,
  MarginaliaHighlight,
  MarginaliaHighlightColor,
  MarginaliaProgressInput,
} from "@secondpass/client";

export function toMarginaliaLocationLabel(value: string | null | undefined): string {
  return (value ?? "").slice(0, 255);
}

export function normalizeHighlightText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeOptionalHighlightContext(value?: string): string {
  return normalizeHighlightText(value ?? "");
}

export function buildMarginaliaProgressInput(cfi: string, locationLabel?: string): MarginaliaProgressInput {
  assertDurableReaderCfi(cfi);
  return { location: cfi, locationLabel: toMarginaliaLocationLabel(locationLabel) };
}

export function buildBookmarkUpsert(input: {
  clientId: string;
  cfi: string;
  locationLabel?: string;
}): CurrentSessionAnnotationMutation {
  assertDurableReaderCfi(input.cfi);
  return {
    action: "upsert",
    annotation: {
      clientId: input.clientId,
      kind: "bookmark",
      location: { location: input.cfi, locationLabel: toMarginaliaLocationLabel(input.locationLabel) },
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
}): CurrentSessionAnnotationMutation {
  const text = normalizeHighlightText(input.text);
  if (!text) throw new Error("Highlight text must not be blank.");
  assertDurableReaderCfi(input.cfi);

  return {
    action: "upsert",
    annotation: {
      clientId: input.clientId,
      kind: "highlight",
      location: { location: input.cfi, locationLabel: toMarginaliaLocationLabel(input.locationLabel) },
      body: {
        text,
        prefix: normalizeOptionalHighlightContext(input.prefix),
        suffix: normalizeOptionalHighlightContext(input.suffix),
        color: input.color,
        note: input.note ?? "",
      },
    },
  };
}

export function buildHighlightUpdate(annotation: MarginaliaHighlight, input: {
  color: MarginaliaHighlightColor;
  note: string;
}): CurrentSessionAnnotationMutation {
  const text = normalizeHighlightText(annotation.body.text);
  if (!text) throw new Error("Highlight text must not be blank.");
  assertDurableReaderCfi(annotation.location.location);

  return {
    action: "upsert",
    annotation: {
      clientId: annotation.clientId,
      kind: "highlight",
      location: annotation.location,
      body: {
        ...annotation.body,
        text,
        prefix: normalizeOptionalHighlightContext(annotation.body.prefix),
        suffix: normalizeOptionalHighlightContext(annotation.body.suffix),
        color: input.color,
        note: input.note,
      },
    },
  };
}

export function buildCurrentSessionHighlightCommit(input: {
  currentAnnotations: MarginaliaAnnotation[];
  createClientId: () => string;
  cfi: string;
  locationLabel?: string;
  text: string;
  prefix?: string;
  suffix?: string;
  color: MarginaliaHighlightColor;
  note?: string;
}): { kind: "created" | "updated"; operation: CurrentSessionAnnotationMutation } {
  const existing = input.currentAnnotations.find(
    (annotation): annotation is MarginaliaHighlight =>
      annotation.kind === "highlight" && annotation.location.location === input.cfi,
  );
  if (existing) {
    return {
      kind: "updated",
      operation: buildHighlightUpdate(existing, {
        color: input.color,
        note: input.note ?? existing.body.note ?? "",
      }),
    };
  }

  return {
    kind: "created",
    operation: buildHighlightUpsert({
      clientId: input.createClientId(),
      cfi: input.cfi,
      locationLabel: input.locationLabel,
      text: input.text,
      prefix: input.prefix,
      suffix: input.suffix,
      color: input.color,
      note: input.note,
    }),
  };
}
