import type { ReactElement } from "react";

export function renderHighlightedExcerpt(excerpt: string, query: string) {
  const q = query.trim();
  if (!q) return excerpt;

  const lowerExcerpt = excerpt.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const parts: Array<string | ReactElement> = [];
  let cursor = 0;
  let matchIndex = lowerExcerpt.indexOf(lowerQuery);
  let key = 0;

  while (matchIndex >= 0) {
    if (matchIndex > cursor) parts.push(excerpt.slice(cursor, matchIndex));
    const end = matchIndex + q.length;
    parts.push(
      <mark key={key} className="spBookSearchMatch">
        {excerpt.slice(matchIndex, end)}
      </mark>,
    );
    key += 1;
    cursor = end;
    matchIndex = lowerExcerpt.indexOf(lowerQuery, cursor);
  }

  if (cursor < excerpt.length) parts.push(excerpt.slice(cursor));
  return parts.length > 0 ? parts : excerpt;
}
