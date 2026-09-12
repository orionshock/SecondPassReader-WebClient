import { ANNOTATION_LIMITS } from "../annotations/ReaderAnnotationLimits.Policy";

export type QuoteContext = {
  exact: string;
  before: string;
  after: string;
};

export type QuoteContextResult = {
  exact: string;
  prefix?: string;
  suffix?: string;
};

function clampToMax(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

// Keep exact quote text intact. Only prefix/suffix context is capped to the server contract;
// long selections use a smaller halo so context does not dwarf the selected quote.
export function buildQuoteContext(input: QuoteContext): QuoteContextResult {
  const exact = input.exact;
  if (!exact) return { exact };

  const rawBefore = input.before ?? "";
  const rawAfter = input.after ?? "";

  const beforeMax = ANNOTATION_LIMITS.textQuoteContextMaxChars;
  const afterMax = ANNOTATION_LIMITS.textQuoteContextMaxChars;

  if (exact.length <= ANNOTATION_LIMITS.textQuoteContextMaxChars) {
    const remaining = Math.max(0, ANNOTATION_LIMITS.textQuoteContextMaxChars - exact.length);
    const each = Math.max(0, Math.floor(remaining / 2));

    const prefix = rawBefore.slice(Math.max(0, rawBefore.length - Math.min(beforeMax, each)));
    const suffix = clampToMax(rawAfter, Math.min(afterMax, each));
    return {
      exact,
      prefix: prefix.trim() ? prefix : undefined,
      suffix: suffix.trim() ? suffix : undefined,
    };
  }

  const halo = Math.min(ANNOTATION_LIMITS.textQuoteContextMaxChars, Math.max(0, Math.ceil(exact.length * 0.1)));
  const each = Math.max(0, Math.floor(halo / 2));
  const prefix = rawBefore.slice(Math.max(0, rawBefore.length - Math.min(beforeMax, each)));
  const suffix = clampToMax(rawAfter, Math.min(afterMax, each));
  return {
    exact,
    prefix: prefix.trim() ? prefix : undefined,
    suffix: suffix.trim() ? suffix : undefined,
  };
}
