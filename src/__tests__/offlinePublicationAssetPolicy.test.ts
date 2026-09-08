import { describe, expect, it } from "vitest";
import { buildOfflineCacheNamespace } from "../app/offline/OfflineCacheNamespace.Policy";
import {
  buildOfflinePublicationAssetKey,
  classifyOfflinePublicationAssetAvailability,
  isVerifiedOfflinePublicationAsset,
  shouldReplaceOfflinePublicationAsset,
} from "../app/offline/OfflinePublicationAsset.Policy";

const CHECKSUM_A = "a".repeat(64);
const CHECKSUM_B = "b".repeat(64);

describe("offline publication asset policy", () => {
  it("does not admit metadata without a local asset record", () => {
    const availability = classifyOfflinePublicationAssetAvailability({
      fileMetadata: { format: "epub", checksum: CHECKSUM_A, fileSize: 10 },
    });

    expect(availability).toEqual({ status: "metadata-only" });
    expect(isVerifiedOfflinePublicationAsset(availability)).toBe(false);
  });

  it.each([
    { fileMetadata: null, reason: "missing-file-metadata" },
    { fileMetadata: { format: " " }, reason: "missing-format" },
  ] as const)("rejects incomplete file metadata", ({ fileMetadata, reason }) => {
    const availability = classifyOfflinePublicationAssetAvailability({ fileMetadata });

    expect(availability).toEqual({ status: "unsupported", reason });
    expect(isVerifiedOfflinePublicationAsset(availability)).toBe(false);
  });

  it.each(["missing", "partial"] as const)("does not admit a %s asset record", (status) => {
    const availability = classifyOfflinePublicationAssetAvailability({
      fileMetadata: { format: "epub", checksum: CHECKSUM_A, fileSize: 10 },
      assetRecord: { status },
    });

    expect(availability.status).toBe(status);
    expect(isVerifiedOfflinePublicationAsset(availability)).toBe(false);
  });

  it("validates complete bytes without assuming a Reader format", () => {
    const availability = classifyOfflinePublicationAssetAvailability({
      fileMetadata: { format: "CBZ", checksum: CHECKSUM_A, fileSize: 10 },
      assetRecord: { status: "complete", format: "cbz", checksum: CHECKSUM_A.toUpperCase(), byteLength: 10 },
    });

    expect(availability).toEqual({ status: "available", fileSizeMismatch: false });
    expect(isVerifiedOfflinePublicationAsset(availability)).toBe(true);
  });

  it("rejects a record for a different format", () => {
    const availability = classifyOfflinePublicationAssetAvailability({
      fileMetadata: { format: "epub", checksum: CHECKSUM_A, fileSize: 10 },
      assetRecord: { status: "complete", format: "cbz", checksum: CHECKSUM_A, byteLength: 10 },
    });

    expect(availability.status).toBe("format-mismatch");
    expect(isVerifiedOfflinePublicationAsset(availability)).toBe(false);
  });

  it("rejects complete bytes whose checksum differs from server identity", () => {
    const availability = classifyOfflinePublicationAssetAvailability({
      fileMetadata: { format: "epub", checksum: CHECKSUM_A, fileSize: 10 },
      assetRecord: { status: "complete", format: "epub", checksum: CHECKSUM_B, byteLength: 10 },
    });

    expect(availability.status).toBe("checksum-mismatch");
  });

  it("reports size mismatch without overriding matching format and checksum", () => {
    expect(classifyOfflinePublicationAssetAvailability({
      fileMetadata: { format: "epub", checksum: CHECKSUM_A, fileSize: 10 },
      assetRecord: { status: "complete", format: "epub", checksum: CHECKSUM_A, byteLength: 9 },
    })).toEqual({ status: "available", fileSizeMismatch: true });
  });

  it("includes format in asset identity but excludes display metadata", () => {
    const namespace = buildOfflineCacheNamespace({
      serverBaseUrl: "https://library.example",
      accountProfileId: "profile-1",
    });
    const input = {
      namespace,
      bookId: "book/1",
      format: "EPUB",
      checksum: CHECKSUM_A.toUpperCase(),
      title: "Old title",
    };
    const renamed = { ...input, title: "New title" };

    expect(buildOfflinePublicationAssetKey(renamed)).toBe(
      buildOfflinePublicationAssetKey(input),
    );
    expect(buildOfflinePublicationAssetKey(input)).toBe(
      `server:https%3A%2F%2Flibrary.example|profile:profile-1|book:book%2F1|format:epub|checksum:${CHECKSUM_A}`,
    );
    expect(buildOfflinePublicationAssetKey({ ...input, format: "cbz" })).not.toBe(
      buildOfflinePublicationAssetKey(input),
    );
  });

  it.each([
    { namespace: null, bookId: "book-1", format: "epub", checksum: CHECKSUM_A },
    { namespace: buildOfflineCacheNamespace({ serverBaseUrl: "https://library.example", accountProfileId: "profile-1" }), bookId: " ", format: "epub", checksum: CHECKSUM_A },
    { namespace: buildOfflineCacheNamespace({ serverBaseUrl: "https://library.example", accountProfileId: "profile-1" }), bookId: "book-1", format: " ", checksum: CHECKSUM_A },
    { namespace: buildOfflineCacheNamespace({ serverBaseUrl: "https://library.example", accountProfileId: "profile-1" }), bookId: "book-1", format: "epub", checksum: "invalid" },
  ])("does not build incomplete asset identity", (input) => {
    expect(buildOfflinePublicationAssetKey(input)).toBeNull();
  });

  it("requires replacement only when two known checksums differ", () => {
    expect(shouldReplaceOfflinePublicationAsset({ currentChecksum: CHECKSUM_A, nextChecksum: CHECKSUM_B })).toBe(true);
    expect(shouldReplaceOfflinePublicationAsset({ currentChecksum: CHECKSUM_A, nextChecksum: CHECKSUM_A })).toBe(false);
    expect(shouldReplaceOfflinePublicationAsset({ currentChecksum: CHECKSUM_A, nextChecksum: null })).toBe(false);
  });
});
