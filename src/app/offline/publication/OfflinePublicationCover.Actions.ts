import type { BookDetail, SecondPassClient } from "@secondpass/client";
import type { OfflineCacheNamespace } from "../namespace/OfflineCacheNamespace.Policy";
import type {
  OfflinePublicationCoverRecord,
  OfflinePublicationCoverRepository,
} from "../storage/OfflineRepositories.Types";
import { debugWarn } from "../../../lib/debug/DebugLogger.Diagnostics";
import {
  isUsableOfflinePublicationCover,
  normalizeOfflinePublicationCoverContentType,
} from "./OfflinePublicationCover.Policy";

const COVER_SCHEMA_VERSION = 1;

export type OfflinePublicationCoverAcquisitionResult =
  | { status: "stored" | "already-available"; sourceUrl: string; contentType: string; byteLength: number }
  | { status: "unavailable" }
  | { status: "failed" };

export async function acquireOfflinePublicationCover(input: {
  namespace: OfflineCacheNamespace;
  book: BookDetail;
  spl: SecondPassClient;
  repository: OfflinePublicationCoverRepository<Blob>;
}): Promise<OfflinePublicationCoverAcquisitionResult> {
  const namespaceKey = input.namespace.key.trim();
  const bookId = String(input.book.id).trim();
  if (!namespaceKey || !bookId) return { status: "failed" };

  const sourceUrl = resolveCoverSource(input.book.coverUrl, input.namespace.serverOrigin);
  let existing: OfflinePublicationCoverRecord<Blob> | null;
  try {
    existing = await input.repository.get(namespaceKey, bookId);
  } catch (error) {
    debugWarn("reader", "offline cover record could not be read", { bookId, operation: "acquire", error });
    return { status: "failed" };
  }

  if (!sourceUrl) {
    if (existing) {
      try {
        await input.repository.delete(namespaceKey, bookId);
      } catch (error) {
        debugWarn("reader", "stale offline cover could not be removed", { bookId, operation: "acquire", error });
        return { status: "failed" };
      }
    }
    return { status: "unavailable" };
  }

  if (existing?.sourceUrl === sourceUrl && isUsableOfflinePublicationCover(existing)) {
    return {
      status: "already-available",
      sourceUrl,
      contentType: normalizeOfflinePublicationCoverContentType(existing.contentType)!,
      byteLength: existing.byteLength,
    };
  }

  try {
    const downloaded = await input.spl.library.books.downloadCover(sourceUrl);
    const contentType = normalizeOfflinePublicationCoverContentType(downloaded.contentType ?? downloaded.blob.type);
    if (!contentType || downloaded.blob.size <= 0) {
      debugWarn("reader", "offline cover download was not a supported image", { bookId, operation: "acquire" });
      return { status: "failed" };
    }
    await input.repository.put({
      namespaceKey,
      bookId,
      sourceUrl,
      contentType: contentType!,
      byteLength: downloaded.blob.size,
      schemaVersion: COVER_SCHEMA_VERSION,
      payload: downloaded.blob,
    });
    return { status: "stored", sourceUrl, contentType: contentType!, byteLength: downloaded.blob.size };
  } catch (error) {
    debugWarn("reader", "offline cover acquisition failed", { bookId, operation: "acquire", error });
    return { status: "failed" };
  }
}

function resolveCoverSource(value: string | null | undefined, serverOrigin: string): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  try {
    const url = new URL(raw, serverOrigin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
