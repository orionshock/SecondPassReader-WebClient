import type { SecondPassClient } from "@secondpass/client";
import {
  createOfflineNamespacePublicationLease,
  type OfflineNamespacePublicationLease,
} from "../../app/offline/namespace/OfflineNamespacePublication.Lifecycle";

export type HomePreviewKind = "recent" | "shelves";

export type HomePreviewRequest = {
  publication: OfflineNamespacePublicationLease | null;
  isCurrent(): boolean;
};

// Home requests may outlive the authenticated client/namespace that started them. A result and
// its cache projection remain publishable only while both this preview generation and namespace lease are current.
export class HomePreviewLifetime {
  private invalidated = false;
  private readonly generations: Record<HomePreviewKind, number> = { recent: 0, shelves: 0 };
  readonly namespaceKey: string;

  constructor(readonly client: SecondPassClient | null, namespaceKey: string | null) {
    this.namespaceKey = namespaceKey?.trim() ?? "";
  }

  matches(client: SecondPassClient | null, namespaceKey: string | null): boolean {
    return this.client === client && this.namespaceKey === (namespaceKey?.trim() ?? "");
  }

  activate(): void {
    this.invalidated = false;
  }

  begin(kind: HomePreviewKind): HomePreviewRequest {
    const generation = ++this.generations[kind];
    const isCurrent = () => !this.invalidated && this.generations[kind] === generation;
    return {
      isCurrent,
      publication: createOfflineNamespacePublicationLease(this.namespaceKey, isCurrent),
    };
  }

  invalidate(kind?: HomePreviewKind): void {
    if (kind) {
      this.generations[kind] += 1;
      return;
    }
    this.invalidated = true;
    this.generations.recent += 1;
    this.generations.shelves += 1;
  }
}
