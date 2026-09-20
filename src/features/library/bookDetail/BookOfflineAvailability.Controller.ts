import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookDetail, SecondPassClient } from "@secondpass/client";
import { getBrowserOfflinePersistenceCapability } from "../../../app/offline/browser/BrowserOfflineCapability.Queries";
import { buildOfflineCacheNamespace } from "../../../app/offline/namespace/OfflineCacheNamespace.Policy";
import {
  classifyOfflinePublicationAssetAvailability,
  normalizePublicationChecksum,
  normalizePublicationFormat,
} from "../../../app/offline/publication/OfflinePublicationAsset.Policy";
import {
  acquireOfflinePublicationAsset,
  type OfflinePublicationAcquisitionResult,
} from "../../../app/offline/publication/OfflinePublicationAcquisition.Actions";
import { acquireOfflinePublicationCover } from "../../../app/offline/publication/OfflinePublicationCover.Actions";
import { removeOfflinePublicationAsset } from "../../../app/offline/publication/OfflinePublicationRemoval.Actions";
import { createOfflineNamespacePublicationLease } from "../../../app/offline/namespace/OfflineNamespacePublication.Lifecycle";
import {
  openIndexedDbOfflineRepositories,
  type IndexedDbOfflineRepositories,
} from "../../../app/offline/storage/IndexedDbOfflineRepositories.Factory";
import { retainOfflineReaderBookMetadata } from "../../../app/offline/reader/continuity/OfflineReaderOpen.Actions";
import type { ActiveConnection } from "../../../storage/ActiveConnection.Store";

const BOOK_DETAIL_OFFLINE_FORMAT = "epub";

type StableStatus =
  | "not-available"
  | "available"
  | "needs-update"
  | "unverifiable"
  | "unsupported"
  | "error";

export type BookOfflineAvailabilityState =
  | { status: "loading" }
  | { status: "working"; operation: "acquire" | "remove" }
  | { status: StableStatus; message: string | null };

export type BookOfflineAvailabilityController = {
  state: BookOfflineAvailabilityState;
  acquire(): Promise<void>;
  remove(): Promise<void>;
};

export function useBookOfflineAvailabilityController({
  connection,
  book,
  spl,
}: {
  connection: ActiveConnection | null;
  book: BookDetail | null;
  spl: SecondPassClient | null;
}): BookOfflineAvailabilityController {
  const namespace = useMemo(() => buildOfflineCacheNamespace({
    serverId: connection?.serverId,
    profileId: connection?.verifiedUser?.profileId,
  }), [connection?.serverId, connection?.verifiedUser?.profileId]);
  const [state, setState] = useState<BookOfflineAvailabilityState>({ status: "loading" });
  const stateRef = useRef(state);
  const repositoriesRef = useRef<IndexedDbOfflineRepositories<Blob> | null>(null);
  const generationRef = useRef(0);
  const retentionRevisionRef = useRef(0);
  const operationRunningRef = useRef(false);

  const updateState = useCallback((next: BookOfflineAvailabilityState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const refresh = useCallback(async (
    repositories: IndexedDbOfflineRepositories<Blob>,
    generation: number,
    message: string | null = null,
  ) => {
    if (!book || !namespace) return;
    const retentionRevision = ++retentionRevisionRef.current;
    const publication = createOfflineNamespacePublicationLease(
      namespace.key,
      () => generation === generationRef.current && retentionRevision === retentionRevisionRef.current,
    );
    if (!publication) return;
    const asset = await repositories.publicationAssets.get(
      namespace.key,
      String(book.id),
      normalizePublicationFormat(book.file?.format)!,
    );
    if (generation !== generationRef.current) return;
    const nextState = classifyStoredAsset(book, asset, message);
    if (nextState.status === "available") {
      const retained = await retainOfflineReaderBookMetadata({
        book,
        repository: repositories.projections,
        publication,
      });
      if (!retained || generation !== generationRef.current) return;
    }
    updateState(nextState);
  }, [book, namespace, updateState]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    operationRunningRef.current = false;
    repositoriesRef.current = null;

    if (!book) {
      updateState({ status: "loading" });
      return;
    }
    if (!hasVerifiableEpub(book)) {
      updateState({ status: "unverifiable", message: "This book does not have a verifiable EPUB file." });
      return;
    }
    if (!namespace || !spl) {
      updateState({ status: "unsupported", message: "Offline storage is unavailable for this connection." });
      return;
    }

    let repositories: IndexedDbOfflineRepositories<Blob> | null = null;
    let cancelled = false;
    updateState({ status: "loading" });

    void (async () => {
      try {
        const capability = await getBrowserOfflinePersistenceCapability();
        if (cancelled) return;
        if (capability.status === "unavailable") {
          updateState({ status: "unsupported", message: "Offline storage is unavailable in this browser." });
          return;
        }

        repositories = await openIndexedDbOfflineRepositories<Blob>();
        if (cancelled) {
          repositories.close();
          return;
        }
        repositoriesRef.current = repositories;
        await refresh(repositories, generation);
      } catch {
        if (!cancelled) {
          updateState(repositories
            ? { status: "error", message: "Offline storage could not be checked." }
            : { status: "unsupported", message: "Offline storage is unavailable in this browser." });
        }
      }
    })();

    return () => {
      cancelled = true;
      generationRef.current += 1;
      retentionRevisionRef.current += 1;
      operationRunningRef.current = false;
      if (repositoriesRef.current === repositories) repositoriesRef.current = null;
      repositories?.close();
    };
  }, [book, connection?.serverBaseUrl, namespace, refresh, spl, updateState]);

  const acquire = useCallback(async () => {
    const repositories = repositoriesRef.current;
    if (operationRunningRef.current || !repositories || !book || !namespace || !spl) return;

    const generation = generationRef.current;
    const publication = createOfflineNamespacePublicationLease(
      namespace.key,
      () => generation === generationRef.current,
    );
    if (!publication) return;
    operationRunningRef.current = true;
    retentionRevisionRef.current += 1;
    const previousState = stateRef.current;
    updateState({ status: "working", operation: "acquire" });
    try {
      const result = await acquireOfflinePublicationAsset({
        namespace,
        publication,
        book,
        spl,
        repository: repositories.publicationAssets,
        supportedFormat: BOOK_DETAIL_OFFLINE_FORMAT,
        requestPersistentStorage: true,
      });
      if (generation !== generationRef.current) return;

      if (result.status === "stored" || result.status === "already-available") {
        await acquireOfflinePublicationCover({
          namespace,
          publication,
          libraryBaseUrl: connection?.serverBaseUrl ?? "",
          book,
          spl,
          repository: repositories.publicationCovers,
        });
        await refresh(repositories, generation);
        return;
      }
      updateState(acquisitionFailureState(result, previousState));
    } catch {
      if (generation === generationRef.current) {
        updateState(withMessage(previousState, "The offline copy could not be prepared. Try again."));
      }
    } finally {
      if (generation === generationRef.current) operationRunningRef.current = false;
    }
  }, [book, connection?.serverBaseUrl, namespace, refresh, spl, updateState]);

  const remove = useCallback(async () => {
    const repositories = repositoriesRef.current;
    if (operationRunningRef.current || !repositories || !book || !namespace) return;

    operationRunningRef.current = true;
    retentionRevisionRef.current += 1;
    const generation = generationRef.current;
    const previousState = stateRef.current;
    updateState({ status: "working", operation: "remove" });
    try {
      await removeOfflinePublicationAsset({
        namespaceKey: namespace.key,
        bookId: String(book.id),
        format: normalizePublicationFormat(book.file?.format)!,
        assetRepository: repositories.publicationAssets,
        coverRepository: repositories.publicationCovers,
      });
      if (generation === generationRef.current) {
        updateState({ status: "not-available", message: null });
      }
    } catch {
      if (generation === generationRef.current) {
        updateState(withMessage(previousState, "The offline copy could not be removed. Try again."));
      }
    } finally {
      if (generation === generationRef.current) operationRunningRef.current = false;
    }
  }, [book, namespace, updateState]);

  return { state, acquire, remove };
}

function hasVerifiableEpub(book: BookDetail): boolean {
  const file = book.file;
  if (!file) return false;
  return Boolean(
    normalizePublicationFormat(file.format) === BOOK_DETAIL_OFFLINE_FORMAT &&
    Number.isFinite(file.fileSize) &&
    file.fileSize >= 0 &&
    normalizePublicationChecksum(file.checksum),
  );
}

function classifyStoredAsset(
  book: BookDetail,
  asset: Awaited<ReturnType<IndexedDbOfflineRepositories<Blob>["publicationAssets"]["get"]>>,
  message: string | null,
): BookOfflineAvailabilityState {
  const availability = classifyOfflinePublicationAssetAvailability({
    fileMetadata: book.file,
    assetRecord: asset,
  });
  if (availability.status === "available") return { status: "available", message };
  if (availability.status === "checksum-mismatch") return { status: "needs-update", message };
  if (availability.status === "unverifiable") return { status: "needs-update", message };
  if (availability.status === "unsupported") return { status: "unverifiable", message };
  return { status: "not-available", message };
}

function acquisitionFailureState(
  result: Exclude<OfflinePublicationAcquisitionResult, { status: "stored" | "already-available" }>,
  previousState: BookOfflineAvailabilityState,
): BookOfflineAvailabilityState {
  if (result.status === "unsupported") {
    return { status: "unsupported", message: "Offline storage is unavailable in this browser." };
  }
  if (result.status === "unverifiable") {
    return { status: "unverifiable", message: "This book does not have a verifiable EPUB file." };
  }
  if (result.status === "insufficient-storage") {
    return withMessage(previousState, "Not enough storage. Try again after freeing space.");
  }
  if (result.status === "limited") {
    return withMessage(previousState, "Storage capacity could not be confirmed. Try again.");
  }
  return withMessage(previousState, "The offline copy could not be prepared. Try again.");
}

function withMessage(
  state: BookOfflineAvailabilityState,
  message: string,
): BookOfflineAvailabilityState {
  if (state.status === "available" || state.status === "needs-update" || state.status === "not-available") {
    return { status: state.status, message };
  }
  return { status: "error", message };
}
