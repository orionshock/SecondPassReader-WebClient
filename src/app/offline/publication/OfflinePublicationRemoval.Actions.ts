import type {
  OfflinePublicationAssetRepository,
  OfflinePublicationCoverRepository,
} from "../storage/OfflineRepositories.Types";

export async function removeOfflinePublicationAsset(input: {
  namespaceKey: string;
  bookId: string;
  format: string;
  assetRepository: OfflinePublicationAssetRepository<Blob>;
  coverRepository: OfflinePublicationCoverRepository<Blob>;
}): Promise<void> {
  const assets = await input.assetRepository.list(input.namespaceKey);
  const hasAnotherFormat = assets.some((asset) => (
    asset.bookId === input.bookId && asset.format !== input.format
  ));
  // Covers are Book-scoped, so retain one while any publication format remains available offline.
  if (!hasAnotherFormat) {
    await input.coverRepository.delete(input.namespaceKey, input.bookId);
  }
  await input.assetRepository.delete(input.namespaceKey, input.bookId, input.format);
}

export async function removeAllOfflinePublicationAssets(input: {
  namespaceKey: string;
  assetRepository: OfflinePublicationAssetRepository<Blob>;
  coverRepository: OfflinePublicationCoverRepository<Blob>;
}): Promise<void> {
  await input.coverRepository.deleteNamespace(input.namespaceKey);
  await input.assetRepository.deleteNamespace(input.namespaceKey);
}
