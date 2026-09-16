import type { BookDetail } from "@secondpass/client";
import { describe, expect, it } from "vitest";
import {
  buildOfflineSavedPublications,
  selectOfflineSavedPublication,
} from "../../../app/offline/publication/OfflineSavedPublication.Queries";
import type {
  OfflinePublicationAssetCompleteRecord,
  OfflinePublicationCoverRecord,
} from "../../../app/offline/storage/OfflineRepositories.Types";

const CHECKSUM = "a".repeat(64);

describe("offline saved publication assembly", () => {
  it("assembles a complete retained Book from its asset, metadata, and usable cover", () => {
    const saved = buildOfflineSavedPublications({
      assets: [asset("book-1")],
      metadata: new Map([["book-1", book("book-1", "Saved Book")]]),
      covers: new Map([["book-1", cover("book-1")]]),
    });

    expect(saved).toEqual([expect.objectContaining({
      bookId: "book-1",
      title: "Saved Book",
      titleAvailable: true,
      assetBytes: 4,
      admission: "available",
      coverBlob: expect.any(Blob),
    })]);
  });

  it("keeps asset membership distinct from metadata and uses a safe title/cover fallback", () => {
    const saved = buildOfflineSavedPublications({
      assets: [asset("very-long-book-identifier")],
      metadata: new Map([
        ["very-long-book-identifier", null],
        ["metadata-only", book("metadata-only", "Metadata only")],
      ]),
    });

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      bookId: "very-long-book-identifier",
      title: "Book very-lon...",
      titleAvailable: false,
      admission: "unavailable",
      coverBlob: null,
    });
    expect(saved.some((entry) => entry.bookId === "metadata-only")).toBe(false);
  });

  it("uses actual retained Blob bytes and rejects unsupported or damaged payloads", () => {
    const damaged = asset("damaged");
    damaged.byteLength = 99;
    const saved = buildOfflineSavedPublications({
      assets: [damaged, asset("comic", "cbz")],
      metadata: new Map([
        ["damaged", book("damaged", "Damaged")],
        ["comic", book("comic", "Comic", "cbz")],
      ]),
    });

    expect(saved.find((entry) => entry.bookId === "damaged")).toMatchObject({
      assetBytes: 4,
      admission: "unavailable",
    });
    expect(saved.find((entry) => entry.bookId === "comic")?.admission).toBe("unsupported-format");
    expect(selectOfflineSavedPublication(saved, "comic", "cbz")?.bookId).toBe("comic");
  });
});

function asset(bookId: string, format = "epub"): OfflinePublicationAssetCompleteRecord<Blob> {
  const payload = new Blob(["book"]);
  return {
    status: "complete",
    namespaceKey: "account-a",
    bookId,
    format,
    checksum: CHECKSUM,
    byteLength: payload.size,
    schemaVersion: 1,
    payload,
  };
}

function cover(bookId: string): OfflinePublicationCoverRecord<Blob> {
  const payload = new Blob(["cover"], { type: "image/jpeg" });
  return {
    namespaceKey: "account-a",
    bookId,
    sourceUrl: "https://library.example/cover.jpg",
    contentType: "image/jpeg",
    byteLength: payload.size,
    schemaVersion: 1,
    payload,
  };
}

function book(bookId: string, title: string, format = "epub"): BookDetail {
  return {
    id: bookId,
    title,
    authors: [],
    catalogTags: [],
    groups: [],
    file: { format, checksum: CHECKSUM, fileSize: 4, downloadUrl: "https://library.example/private" },
  } as unknown as BookDetail;
}
