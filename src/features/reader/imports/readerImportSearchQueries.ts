const MAX_IMPORT_SEARCH_QUERIES = 12;
const SENTENCE_QUOTE_PUNCTUATION = /^["'\u2018\u2019\u201c\u201d]+|[.!?]+["'\u2018\u2019\u201c\u201d]*$/g;

export type ReaderImportSearchQueryPlan = {
  query: string;
  repairText?: string;
  prefix?: string;
  suffix?: string;
};

export function buildImportSearchQueries(text: string): string[] {
  return buildImportSearchQueryPlans(text).map((plan) => plan.query);
}

export function buildImportSearchQueryPlans(text: string): ReaderImportSearchQueryPlan[] {
  const normalized = normalizeSearchText(text);
  if (!normalized) return [];

  const plans: ReaderImportSearchQueryPlan[] = [];
  addPlan(plans, normalized);

  const sentences = splitSearchSentences(normalized);
  for (const sentence of sentences) {
    if (!isUsefulSentenceFragment(sentence)) continue;
    addPlan(plans, sentence);

    const simplified = simplifySentenceFragment(sentence);
    if (simplified !== sentence) {
      addPlan(plans, simplified, sentence, buildFragmentContext(normalized, simplified));
    }
  }

  for (const sentence of sentences) {
    for (const fragment of splitQuoteIntoPunctuationBoundedFragments(sentence)) {
      if (isUsefulPunctuationFragment(fragment)) {
        addPlan(plans, fragment, sentence, buildFragmentContext(normalized, fragment));
      }
    }

    if (wordCount(sentence) >= 14 || sentence.length >= 100) {
      for (const clause of splitSearchClauses(sentence)) {
        if (isUsefulClauseFragment(clause)) {
          addPlan(plans, clause, sentence, buildFragmentContext(normalized, clause));
        }
      }
    }
  }

  const words = normalized.split(" ").filter(Boolean);
  const windowStart = Math.max(0, Math.floor((words.length - 18) / 2));
  for (const fragment of [
    words.slice(0, 18).join(" "),
    words.slice(windowStart, windowStart + 18).join(" "),
    words.slice(Math.max(0, words.length - 18)).join(" "),
  ]) {
    if (isUsefulWordWindow(fragment)) {
      addPlan(plans, fragment, normalized, buildFragmentContext(normalized, fragment));
    }
  }

  addEllipsisVariants(plans);
  return plans;
}

function addPlan(
  plans: ReaderImportSearchQueryPlan[],
  query: string,
  repairText?: string,
  context?: { prefix?: string; suffix?: string },
): void {
  if (plans.length >= MAX_IMPORT_SEARCH_QUERIES) return;
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || plans.some((plan) => plan.query === normalizedQuery)) return;
  const normalizedRepairText = repairText ? normalizeSearchText(repairText) : undefined;
  plans.push({
    query: normalizedQuery,
    repairText: normalizedRepairText && normalizedRepairText !== normalizedQuery ? normalizedRepairText : undefined,
    prefix: context?.prefix,
    suffix: context?.suffix,
  });
}

function buildFragmentContext(fullText: string, fragment: string): { prefix?: string; suffix?: string } {
  const at = fullText.indexOf(fragment);
  if (at < 0) return {};
  const contextLength = 250;
  const prefix = fullText.slice(Math.max(0, at - contextLength), at).trim();
  const suffix = fullText.slice(at + fragment.length, at + fragment.length + contextLength).trim();
  return {
    prefix: prefix || undefined,
    suffix: suffix || undefined,
  };
}

function addEllipsisVariants(plans: ReaderImportSearchQueryPlan[]): void {
  for (const plan of [...plans]) {
    const spacedEllipsis = plan.query.replace(/\.{3}/g, ". . .");
    if (spacedEllipsis !== plan.query) addLiteralPlan(plans, spacedEllipsis, plan.repairText ?? plan.query);
  }
  for (const plan of [...plans]) {
    const nbspEllipsis = plan.query.replace(/ \. \. \./g, "\u00a0.\u00a0.\u00a0.");
    if (nbspEllipsis !== plan.query) addLiteralPlan(plans, nbspEllipsis, plan.repairText ?? plan.query);
  }
}

function addLiteralPlan(plans: ReaderImportSearchQueryPlan[], query: string, repairText: string): void {
  if (plans.length >= MAX_IMPORT_SEARCH_QUERIES || plans.some((plan) => plan.query === query)) return;
  plans.push({ query, repairText: normalizeSearchText(repairText) });
}

function normalizeSearchText(text: string): string {
  return text
    .replace(/\u2026/g, "...")
    .replace(/(?:\.\s*){3,}/g, "...")
    .replace(/\.{3}(?=\S)/g, "... ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSearchSentences(text: string): string[] {
  const ellipsisToken = "\u0000ellipsis\u0000";
  const protectedText = text.replace(/\.{3}/g, ellipsisToken);
  const matches = protectedText.match(/.*?(?:[.!?]+["'\u2018\u2019\u201c\u201d]*(?=\s+|$)|$)/g) ?? [];
  return matches
    .map((sentence) => normalizeSearchText(sentence.replaceAll(ellipsisToken, "...")))
    .filter(Boolean);
}

function simplifySentenceFragment(sentence: string): string {
  return normalizeSearchText(sentence.replace(SENTENCE_QUOTE_PUNCTUATION, ""));
}

function splitQuoteIntoPunctuationBoundedFragments(value: string): string[] {
  const chars = [...value];
  const fragments: string[] = [];
  let current = "";

  const flush = () => {
    const fragment = stripBoundaryPunctuationForSearch(current);
    if (fragment) fragments.push(fragment);
    current = "";
  };

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? "";
    if (isSearchFragmentBoundary(char, chars[index - 1], chars[index + 1])) flush();
    else current += char;
  }
  flush();
  return fragments;
}

function stripBoundaryPunctuationForSearch(value: string): string {
  return normalizeSearchText(value.replace(
    /^[\s"',;:.?!\u2018\u2019\u201c\u201d]+|[\s"',;:.?!\u2018\u2019\u201c\u201d]+$/g,
    "",
  ));
}

function isSearchFragmentBoundary(char: string, previous: string | undefined, next: string | undefined): boolean {
  if (/[,;:.?!"\u201c\u201d]/.test(char)) return true;
  if (char !== "'" && char !== "\u2018" && char !== "\u2019") return false;
  return !isWordCharacter(previous) || !isWordCharacter(next);
}

function isWordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{N}]/u.test(value));
}

function splitSearchClauses(sentence: string): string[] {
  return sentence
    .split(/\s*(?:[,;:]|\u2014|\u2013)\s*/)
    .map(simplifySentenceFragment)
    .filter(Boolean);
}

function wordCount(text: string): number {
  return text.split(" ").filter((word) => /[a-z0-9]/i.test(word)).length;
}

function isUsefulSentenceFragment(text: string): boolean {
  return text.length >= 10 && wordCount(text) >= 2;
}

function isUsefulClauseFragment(text: string): boolean {
  return text.length >= 16 && wordCount(text) >= 3;
}

function isUsefulPunctuationFragment(text: string): boolean {
  return text.length >= 10 && wordCount(text) >= 2;
}

function isUsefulWordWindow(text: string): boolean {
  return text.length >= 24 && wordCount(text) >= 6;
}
