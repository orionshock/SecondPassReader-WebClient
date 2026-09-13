import type { CurrentSessionAnnotationMutation } from "../../../../features/reader/session/annotations/CurrentSessionAnnotation.Types";
import type { OfflineReaderAnnotationProjection, OfflineReaderBookState } from "../../storage/OfflineRepositories.Types";
import type { OfflineReaderSession } from "../continuity/OfflineReaderSession.Policy";
import type { ContinuationTransform } from "../replay/OfflineReaderAnnotationContinuation.Actions";

export type LocalReaderAnnotationCommit = { namespaceKey: string; bookId: string } & (
  | {
      kind: "author";
      authority: OfflineReaderSession;
      expectedRevision: number;
      expectedProjection: OfflineReaderAnnotationProjection | undefined;
      mutation: CurrentSessionAnnotationMutation;
    }
  | { kind: "continue"; targetSessionId: string; transforms: readonly ContinuationTransform[] }
);

export type LocalReaderAnnotationCommitResult =
  | { status: "committed"; state: OfflineReaderBookState }
  | { status: "conflict" | "no-local-state" | "not-writable" };

export interface LocalReaderAnnotationCommitRepository {
  commit(input: LocalReaderAnnotationCommit): Promise<LocalReaderAnnotationCommitResult>;
}
