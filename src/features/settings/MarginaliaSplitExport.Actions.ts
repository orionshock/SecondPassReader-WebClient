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

const MARGINALIA_EXPORT_TYPE = "SecondPassMarginaliaExport";
const MARGINALIA_EXPORT_SCHEMA_VERSION = "0.1.0";
const MARGINALIA_EXPORT_PROFILE = "https://secondpasslibrary.local/specs/marginalia/0.1.0";

export function parseAndSplitMarginaliaExport(text: string): MarginaliaSplitResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("This file is not valid JSON. Check the file and try again.", { cause: error });
  }
  return splitMarginaliaExport(parsed);
}

export function splitMarginaliaExport(input: unknown): MarginaliaSplitResult {
  if (!isRecord(input)) throw new Error("This file is not a Second Pass Marginalia export. Choose another file.");

  const schemaVersion = getString(input.schemaVersion);
  if (schemaVersion !== MARGINALIA_EXPORT_SCHEMA_VERSION) {
    throw new Error("This export version cannot be split with this version of Second Pass Reader.", {
      cause: new Error(`Unsupported Marginalia export schema version: ${schemaVersion ?? "missing"}.`),
    });
  }
  if (input.type !== MARGINALIA_EXPORT_TYPE || input.profile !== MARGINALIA_EXPORT_PROFILE) {
    throw new Error("This file is not a supported Second Pass Marginalia export.");
  }

  const books = readBooks(input);
  if (books.length === 0) throw new Error("This export contains no Books to split.");
  validateArchiveLocations(books);

  const items: MarginaliaSplitItem[] = [];
  let annotationCount = 0;

  books.forEach((book, bookIndex) => {
    const sessions = getArray(book.readingSessions);
    sessions.forEach((sessionRaw, sessionIndex) => {
      if (!isRecord(sessionRaw)) return;

      const annotations = getArray(sessionRaw.annotations);
      annotationCount += annotations.length;

      const session = { ...sessionRaw, annotations };
      const bookCopy = { ...book, readingSessions: [session] };
      const exportJson: Record<string, unknown> = {
        ...input,
        books: [bookCopy],
      };

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
    getString(input.book.fileHash) ??
    getString(input.book.title) ??
    `book-${input.bookIndex + 1}`;
  const sessionPart =
    getString(input.session.sourceReadingSessionId) ??
    getString(input.session.startedAt) ??
    `session-${input.sessionIndex + 1}`;

  const prefix = `${String(input.bookIndex + 1).padStart(2, "0")}-${String(input.sessionIndex + 1).padStart(2, "0")}`;
  return `${prefix}-${slugPart(bookPart)}-${slugPart(sessionPart)}.json`;
}

export function buildBookFolderName(input: { book: Record<string, unknown>; bookIndex: number }): string {
  const bookPart =
    getString(input.book.fileHash) ??
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
    getString(session.name) ??
    getString(session.startedAt) ??
    getString(session.sourceReadingSessionId) ??
    "Untitled Reading Session"
  );
}

function readBooks(input: Record<string, unknown>): Record<string, unknown>[] {
  return getArray(input.books).filter(isRecord);
}

function validateArchiveLocations(books: readonly Record<string, unknown>[]): void {
  for (const book of books) {
    if (!Array.isArray(book.readingSessions)) throw new Error("A Marginalia Book is missing readingSessions.");
    for (const session of book.readingSessions) {
      if (!isRecord(session) || !Array.isArray(session.annotations)) {
        throw new Error("A Marginalia Reading Session is invalid.");
      }
      if (session.progress !== null) validateProgressLocation(session.progress);
      for (const annotation of session.annotations) validateAnnotationLocation(annotation);
    }
  }
}

function validateProgressLocation(value: unknown): void {
  if (!isRecord(value) || "cfi" in value || !getString(value.location)) {
    throw new Error("Marginalia progress requires a nonblank location.");
  }
}

function validateAnnotationLocation(value: unknown): void {
  if (!isRecord(value) || !isRecord(value.location) || "cfi" in value.location || !getString(value.location.location)) {
    throw new Error("A Marginalia annotation requires location.location.");
  }
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
