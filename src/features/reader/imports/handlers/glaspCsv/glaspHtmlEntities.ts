const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  ldquo: "\u201c",
  rdquo: "\u201d",
  lsquo: "\u2018",
  rsquo: "\u2019",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
};

const HTML_ENTITY_PATTERN = /&(#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]+);/gi;

export function decodeHtmlEntities(value: string): string {
  return value.replace(HTML_ENTITY_PATTERN, (entity, reference: string) => {
    if (!reference.startsWith("#")) {
      return NAMED_HTML_ENTITIES[reference.toLowerCase()] ?? entity;
    }

    const isHex = reference[1]?.toLowerCase() === "x";
    const digits = reference.slice(isHex ? 2 : 1);
    const codePoint = Number.parseInt(digits, isHex ? 16 : 10);
    if (!isValidCodePoint(codePoint)) return entity;

    return String.fromCodePoint(codePoint);
  });
}

function isValidCodePoint(value: number): boolean {
  return Number.isInteger(value)
    && value > 0
    && value <= 0x10ffff
    && (value < 0xd800 || value > 0xdfff);
}
