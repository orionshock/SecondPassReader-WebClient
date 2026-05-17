import { SecondPassApiClient } from "../../api/SecondPassApiClient";
import type { ConnectionProfile } from "../../storage/connectionProfiles";
import type { LibraryBook } from "../../schemas/library";
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
  const open = await api.openReadingSession({
    apiBaseUrl: profile.apiBaseUrl,
    accessToken: profile.accessToken,
    tokenType: profile.tokenType ?? "Bearer",
    bookId: book.id,
  });

  const download = await api.downloadBookFile({
    downloadUrl: book.file.download_url,
    accessToken: profile.accessToken,
    tokenType: profile.tokenType ?? "Bearer",
  });

  const objectUrl = URL.createObjectURL(download.blob);
  return {
    book,
    blob: download.blob,
    objectUrl,
    openedAt: new Date().toISOString(),
    readingOpen: open,
  };
}

