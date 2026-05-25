import { SecondPassApiClient } from "@secondpass/client";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import type { LibraryBook } from "@secondpass/client";
import type { OpenedBook } from "../reader";

export async function openBookForReader(input: {
  profile: ConnectionProfile;
  book: LibraryBook;
}): Promise<OpenedBook> {
  const { profile, book } = input;

  if (!profile.apiBaseUrl) throw new Error("Profile is missing apiBaseUrl. Run discovery again.");
  if (!profile.accessToken) throw new Error("Profile is not linked.");
  if (!book.file?.download_url) throw new Error("No EPUB file available for this book.");

  const api = new SecondPassApiClient({ serverBaseUrl: profile.serverBaseUrl });

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const open = await withTimeout(
    api.openReadingSession({
      apiBaseUrl: profile.apiBaseUrl,
      accessToken: profile.accessToken,
      tokenType: profile.tokenType ?? "Bearer",
      bookId: book.id,
    }),
    45_000,
    "Opening reading session",
  );

  const download = await withTimeout(
    api.downloadBookFile({
      downloadUrl: book.file.download_url,
      accessToken: profile.accessToken,
      tokenType: profile.tokenType ?? "Bearer",
    }),
    120_000,
    "Downloading EPUB",
  );

  const objectUrl = URL.createObjectURL(download.blob);
  return {
    book,
    blob: download.blob,
    objectUrl,
    openedAt: new Date().toISOString(),
    readingOpen: open,
  };
}
