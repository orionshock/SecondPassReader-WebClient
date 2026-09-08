import { describe, expect, it } from "vitest";
import { buildOfflineCacheNamespace } from "../app/offline/OfflineCacheNamespace.Policy";
import {
  buildOfflineEpubAssetKey,
  canOpenOfflineEpubAsset,
  classifyOfflineEpubAssetAvailability,
  shouldReplaceOfflineEpubAsset,
} from "../app/offline/OfflineEpubAsset.Policy";

const CHECKSUM_A = "a".repeat(64);
const CHECKSUM_B = "b".repeat(64);

describe("offline EPUB asset policy", () => {
  it("does not admit metadata without a local asset record", () => {
    const availability = classifyOfflineEpubAssetAvailability({
      fileMetadata: { format: "epub", checksum: CHECKSUM_A, fileSize: 10 },
    });

    expect(availability).toEqual({ status: "metadata-only" });
    expect(canOpenOfflineEpubAsset(availability)).toBe(false);
  });

  it.each([
    { fileMetadata: null, reason: "missing-file-metadata" },
    { fileMetadata: { format: "pdf" }, reason: "unsupported-format" },
  ] as const)("rejects absent or unsupported file metadata", ({ fileMetadata, reason }) => {
    const availability = classifyOfflineEpubAssetAvailability({ fileMetadata });

    expect(availability).toEqual({ status: "unsupported", reason });
    expect(canOpenOfflineEpubAsset(availability)).toBe(false);
  });

  it.each(["missing", "partial"] as const)("does not admit a %s asset record", (status) => {
    const availability = classifyOfflineEpubAssetAvailability({
      fileMetadata: { format: "epub", checksum: CHECKSUM_A, fileSize: 10 },
      assetRecord: { status },
    });

    expect(availability.status).toBe(status);
    expect(canOpenOfflineEpubAsset(availability)).toBe(false);
  });

  it("admits a complete EPUB whose checksum matches the server identity", () => {
    const availability = classifyOfflineEpubAssetAvailability({
      fileMetadata: { format: "EPUB", checksum: CHECKSUM_A, fileSize: 10 },
      assetRecord: { status: "complete", checksum: CHECKSUM_A.toUpperCase(), byteLength: 10 },
    });

    expect(availability).toEqual({ status: "available", fileSizeMismatch: false });
    expect(canOpenOfflineEpubAsset(availability)).toBe(true);
  });

  it("rejects a complete EPUB whose checksum differs from the server identity", () => {
    const availability = classifyOfflineEpubAssetAvailability({
      fileMetadata: { format: "epub", checksum: CHECKSUM_A, fileSize: 10 },
      assetRecord: { status: "complete", checksum: CHECKSUM_B, byteLength: 10 },
    });

    expect(availability.status).toBe("checksum-mismatch");
    expect(canOpenOfflineEpubAsset(availability)).toBe(false);
  });

  it.each([
    { expectedChecksum: null, assetChecksum: CHECKSUM_A },
    { expectedChecksum: CHECKSUM_A, assetChecksum: null },
  ])("does not verify complete bytes without both checksums", ({ expectedChecksum, assetChecksum }) => {
    const availability = classifyOfflineEpubAssetAvailability({
      fileMetadata: { format: "epub", checksum: expectedChecksum, fileSize: 10 },
      assetRecord: { status: "complete", checksum: assetChecksum, byteLength: 10 },
    });

    expect(availability.status).toBe("unverifiable");
    expect(canOpenOfflineEpubAsset(availability)).toBe(false);
  });

  it("reports a file-size mismatch without overriding a matching checksum", () => {
    expect(classifyOfflineEpubAssetAvailability({
      fileMetadata: { format: "epub", checksum: CHECKSUM_A, fileSize: 10 },
      assetRecord: { status: "complete", checksum: CHECKSUM_A, byteLength: 9 },
    })).toEqual({ status: "available", fileSizeMismatch: true });
  });

  it("does not use cover metadata for Reader admission", () => {
    const withoutCover = {
      fileMetadata: { format: "epub", checksum: CHECKSUM_A, fileSize: 10 },
      assetRecord: { status: "complete", checksum: CHECKSUM_A, byteLength: 10 } as const,
      coverUrl: null,
    };
    const withCover = { ...withoutCover, coverUrl: "https://library.example/cover.jpg" };

    expect(classifyOfflineEpubAssetAvailability(withoutCover)).toEqual(
      classifyOfflineEpubAssetAvailability(withCover),
    );
  });

  it("builds asset identity from namespace, Book ID, and checksum only", () => {
    const namespace = buildOfflineCacheNamespace({
      serverBaseUrl: "https://library.example",
      accountProfileId: "profile-1",
    });
    const before = {
      namespace,
      bookId: "book/1",
      checksum: CHECKSUM_A.toUpperCase(),
      title: "Old title",
      author: "Old author",
    };
    const after = { ...before, title: "New title", author: "New author" };

    expect(buildOfflineEpubAssetKey(after)).toBe(buildOfflineEpubAssetKey(before));
    expect(buildOfflineEpubAssetKey(before)).toBe(
      `server:https%3A%2F%2Flibrary.example|profile:profile-1|book:book%2F1|checksum:${CHECKSUM_A}`,
    );
  });

  it.each([
    { namespace: null, bookId: "book-1", checksum: CHECKSUM_A },
    { namespace: buildOfflineCacheNamespace({ serverBaseUrl: "https://library.example", accountProfileId: "profile-1" }), bookId: " ", checksum: CHECKSUM_A },
    { namespace: buildOfflineCacheNamespace({ serverBaseUrl: "https://library.example", accountProfileId: "profile-1" }), bookId: "book-1", checksum: "not-sha-256" },
  ])("does not build an incomplete or unverifiable asset key", (input) => {
    expect(buildOfflineEpubAssetKey(input)).toBeNull();
  });

  it("requires replacement only when two known checksums differ", () => {
    expect(shouldReplaceOfflineEpubAsset({ currentChecksum: CHECKSUM_A, nextChecksum: CHECKSUM_B })).toBe(true);
    expect(shouldReplaceOfflineEpubAsset({ currentChecksum: CHECKSUM_A, nextChecksum: CHECKSUM_A })).toBe(false);
    expect(shouldReplaceOfflineEpubAsset({ currentChecksum: CHECKSUM_A, nextChecksum: null })).toBe(false);
  });
});
