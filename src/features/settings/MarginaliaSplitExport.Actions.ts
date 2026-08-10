export type MarginaliaSplitSummary = {
  bookCount: number;
  sessionCount: number;
  annotationCount: number;
};

export type MarginaliaSplitItem = {
  id: string;
  filename: string;
  book: Record<string, unknown>;
  session: Record<string, unknown>;
  annotationCount: number;
  exportJson: Record<string, unknown>;
};

export type MarginaliaBookGroup = {
  id: string;
  book: Record<string, unknown>;
  bookLabel: string;
  folderName: string;
  zipFilename: string;
  items: MarginaliaSplitItem[];
};

export type MarginaliaSplitResult = {
  summary: MarginaliaSplitSummary;
  items: MarginaliaSplitItem[];
};

type SessionCollectionKey = "sessions" | "reading_sessions";
type AnnotationCollectionKey = "annotations" | "items";

export function parseAndSplitMarginaliaExport(text: string): MarginaliaSplitResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON.");
  }
  return splitMarginaliaExport(parsed);
}

export function splitMarginaliaExport(input: unknown): MarginaliaSplitResult {
  if (!isRecord(input)) throw new Error("Marginalia export must be a JSON object.");

  const schemaVersion = getString(input.schema_version) ?? getString(input.schemaVersion);
  if (schemaVersion !== "0.1.0") {
    throw new Error(`Unsupported marginalia export schema version: ${schemaVersion ?? "missing"}.`);
  }

  const books = readBooks(input);
  if (books.length === 0) throw new Error("Marginalia export does not contain any books.");

  const items: MarginaliaSplitItem[] = [];
  let annotationCount = 0;

  books.forEach((book, bookIndex) => {
    const sessionKey = getSessionCollectionKey(book);
    const sessions = getArray(book[sessionKey]);
    sessions.forEach((sessionRaw, sessionIndex) => {
      if (!isRecord(sessionRaw)) return;

      const annotationKey = getAnnotationCollectionKey(sessionRaw);
      const annotations = getArray(sessionRaw[annotationKey]);
      annotationCount += annotations.length;

      const session = { ...sessionRaw, [annotationKey]: annotations };
      const bookCopy = { ...book, [sessionKey]: [session] };
      const exportJson: Record<string, unknown> = {
        ...input,
        books: [bookCopy],
      };

      delete exportJson.book;

      const id = `${bookIndex + 1}-${sessionIndex + 1}`;
      items.push({
        id,
        filename: buildSplitFilename({ book, session, bookIndex, sessionIndex }),
        book: bookCopy,
        session,
        annotationCount: annotations.length,
        exportJson,
      });
    });
  });

  return {
    summary: {
      bookCount: books.length,
      sessionCount: items.length,
      annotationCount,
    },
    items,
  };
}

export function buildSplitFilename(input: {
  book: Record<string, unknown>;
  session: Record<string, unknown>;
  bookIndex: number;
  sessionIndex: number;
}): string {
  const bookPart =
    getString(input.book.id) ??
    getString(input.book.book_id) ??
    getString(input.book.title) ??
    `book-${input.bookIndex + 1}`;
  const sessionPart =
    getString(input.session.id) ??
    getString(input.session.session_id) ??
    getString(input.session.started_at) ??
    getString(input.session.startedAt) ??
    `session-${input.sessionIndex + 1}`;

  const prefix = `${String(input.bookIndex + 1).padStart(2, "0")}-${String(input.sessionIndex + 1).padStart(2, "0")}`;
  return `${prefix}-${slugPart(bookPart)}-${slugPart(sessionPart)}.json`;
}

export function buildBookFolderName(input: { book: Record<string, unknown>; bookIndex: number }): string {
  const bookPart =
    getString(input.book.id) ??
    getString(input.book.book_id) ??
    getString(input.book.title) ??
    `book-${input.bookIndex + 1}`;
  const prefix = String(input.bookIndex + 1).padStart(2, "0");
  return `${prefix}-${slugPart(bookPart)}`;
}

export function buildBookZipFilename(input: { book: Record<string, unknown>; bookIndex: number }): string {
  return `${buildBookFolderName(input)}.zip`;
}

export function groupMarginaliaSplitItems(items: MarginaliaSplitItem[]): MarginaliaBookGroup[] {
  const groups: MarginaliaBookGroup[] = [];
  const groupIndexes = new Map<string, number>();

  for (const item of items) {
    const bookIndex = getBookIndexFromSplitId(item.id) ?? groups.length;
    const groupId = `book-${bookIndex + 1}`;
    let group = groups.find((candidate) => candidate.id === groupId);
    if (!group) {
      groupIndexes.set(groupId, bookIndex);
      group = {
        id: groupId,
        book: item.book,
        bookLabel: formatMarginaliaBookLabel(item.book),
        folderName: buildBookFolderName({ book: item.book, bookIndex }),
        zipFilename: buildBookZipFilename({ book: item.book, bookIndex }),
        items: [],
      };
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups.map((group) => ({
    ...group,
    items: group.items,
    folderName: makeUniqueName(group.folderName, groupIndexes.get(group.id) ?? 0, groups.map((candidate) => candidate.folderName)),
  }));
}

export function filterMarginaliaBookGroups(groups: MarginaliaBookGroup[], hideEmptySessions: boolean): MarginaliaBookGroup[] {
  if (!hideEmptySessions) return groups;
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.annotationCount > 0) }))
    .filter((group) => group.items.length > 0);
}

export function buildAllZipEntries(groups: MarginaliaBookGroup[]): Array<{ path: string; item: MarginaliaSplitItem }> {
  const folderNames = groups.map((group, index) => makeUniqueName(group.folderName, index, groups.map((candidate) => candidate.folderName)));
  const entries: Array<{ path: string; item: MarginaliaSplitItem }> = [];
  groups.forEach((group, groupIndex) => {
    for (const item of group.items) {
      entries.push({ path: `${folderNames[groupIndex]}/${item.filename}`, item });
    }
  });
  return entries;
}

export function formatMarginaliaBookLabel(book: Record<string, unknown>): string {
  const title = getString(book.title) ?? getString(book.name) ?? "Untitled book";
  const author = formatAuthor(book.author ?? book.authors);
  return author ? `${title} - ${author}` : title;
}

export function formatMarginaliaSessionLabel(session: Record<string, unknown>): string {
  return (
    getString(session.label) ??
    getString(session.name) ??
    getString(session.started_at) ??
    getString(session.startedAt) ??
    getString(session.id) ??
    getString(session.session_id) ??
    "Untitled session"
  );
}

function readBooks(input: Record<string, unknown>): Record<string, unknown>[] {
  const books = getArray(input.books).filter(isRecord);
  if (books.length > 0) return books;
  return isRecord(input.book) ? [input.book] : [];
}

function getSessionCollectionKey(book: Record<string, unknown>): SessionCollectionKey {
  return Array.isArray(book.reading_sessions) && !Array.isArray(book.sessions) ? "reading_sessions" : "sessions";
}

function getAnnotationCollectionKey(session: Record<string, unknown>): AnnotationCollectionKey {
  return Array.isArray(session.items) && !Array.isArray(session.annotations) ? "items" : "annotations";
}

function slugPart(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[\\/:"*?<>|]+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 60);
  return ascii || "untitled";
}

function getBookIndexFromSplitId(id: string): number | null {
  const raw = id.split("-", 1)[0];
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed - 1 : null;
}

function makeUniqueName(value: string, index: number, allValues: string[]): string {
  const firstIndex = allValues.indexOf(value);
  return firstIndex === index ? value : `${value}-${String(index + 1).padStart(2, "0")}`;
}

function formatAuthor(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!Array.isArray(value)) return null;
  const names = value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (isRecord(item)) return getString(item.name) ?? getString(item.full_name) ?? "";
      return "";
    })
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
