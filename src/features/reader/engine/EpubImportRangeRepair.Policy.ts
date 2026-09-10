export function normalizeImportRepairText(text: string): string {
  return text.replace(/[\s\u00a0]+/g, " ").trim();
}

export function findPunctuationTolerantRepairRange(
  value: string,
  expected: string,
): { start: number; end: number } | null {
  const projectedValue = projectPunctuationLightText(value);
  const projectedExpected = projectPunctuationLightText(expected).text;
  if (!projectedValue.text || !projectedExpected) return null;
  const at = projectedValue.text.indexOf(projectedExpected);
  if (at < 0) return null;

  let start = projectedValue.offsets[at];
  const lastOffset = projectedValue.offsets[at + projectedExpected.length - 1];
  if (start == null || lastOffset == null) return null;
  const lastChar = String.fromCodePoint(value.codePointAt(lastOffset) ?? 0);
  let end = lastOffset + lastChar.length;
  const trimmedExpected = expected.trim();
  if (/^["'\u2018\u2019\u201c\u201d]/.test(trimmedExpected)) {
    while (start > 0 && /["'\u2018\u2019\u201c\u201d]/.test(value[start - 1] ?? "")) start -= 1;
  }
  if (/[,;:.?!"'\u2018\u2019\u201c\u201d]$/.test(trimmedExpected)) {
    while (end < value.length && /[,;:.?!"'\u2018\u2019\u201c\u201d]/.test(value[end] ?? "")) end += 1;
  }
  return { start, end };
}

export function projectPunctuationLightText(value: string): { text: string; offsets: number[] } {
  const chars: string[] = [];
  const offsets: number[] = [];
  const appendSeparator = (offset: number) => {
    if (chars.length === 0 || chars[chars.length - 1] === " ") return;
    chars.push(" ");
    offsets.push(offset);
  };

  for (let offset = 0; offset < value.length;) {
    const char = String.fromCodePoint(value.codePointAt(offset) ?? 0);
    const nextOffset = offset + char.length;
    if (/[\s\u00a0]/.test(char) || /[,;:.?!"\u201c\u201d]/.test(char)) {
      appendSeparator(offset);
    } else if (char === "'" || char === "\u2018" || char === "\u2019") {
      const previous = value[offset - 1];
      const next = value[nextOffset];
      if (!isRepairWordCharacter(previous) || !isRepairWordCharacter(next)) appendSeparator(offset);
    } else {
      for (const projectedChar of char.toLowerCase()) {
        chars.push(projectedChar);
        offsets.push(offset);
      }
    }
    offset = nextOffset;
  }

  while (chars[chars.length - 1] === " ") {
    chars.pop();
    offsets.pop();
  }
  return { text: chars.join(""), offsets };
}

function isRepairWordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{N}]/u.test(value));
}
