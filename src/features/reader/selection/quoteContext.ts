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

/**
 * Build a TextQuoteSelector-style context, keeping:
 * - `exact` unchanged (never truncated)
 * - `prefix`/`suffix` capped to 500 chars each (server limit)
 *
 * Heuristic:
 * - For short selections (<= 500 chars): target ~500 total across prefix+exact+suffix.
 * - For long selections (> 500 chars): keep a smaller halo ~10% of exact length.
 */
export function buildQuoteContext(input: QuoteContext): QuoteContextResult {
  const exact = input.exact;
  if (!exact) return { exact };

  const rawBefore = input.before ?? "";
  const rawAfter = input.after ?? "";

  const beforeMax = 500;
  const afterMax = 500;

  if (exact.length <= 500) {
    const remaining = Math.max(0, 500 - exact.length);
    const each = Math.max(0, Math.floor(remaining / 2));

    const prefix = rawBefore.slice(Math.max(0, rawBefore.length - Math.min(beforeMax, each)));
    const suffix = clampToMax(rawAfter, Math.min(afterMax, each));
    return {
      exact,
      prefix: prefix.trim() ? prefix : undefined,
      suffix: suffix.trim() ? suffix : undefined,
    };
  }

  const halo = Math.min(500, Math.max(0, Math.ceil(exact.length * 0.1)));
  const each = Math.max(0, Math.floor(halo / 2));
  const prefix = rawBefore.slice(Math.max(0, rawBefore.length - Math.min(beforeMax, each)));
  const suffix = clampToMax(rawAfter, Math.min(afterMax, each));
  return {
    exact,
    prefix: prefix.trim() ? prefix : undefined,
    suffix: suffix.trim() ? suffix : undefined,
  };
}

