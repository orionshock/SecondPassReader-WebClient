export type ReaderImportCycleState = {
  attemptCursor?: number;
  resultCursor?: number;
  hasMatched?: boolean;
};

export type ReaderImportCycleMatch<T> = {
  attemptIndex: number;
  resultIndex: number;
  result: T;
  nextAttemptCursor: number;
  nextResultCursor: number;
  hasMatched: true;
};

export type ReaderImportCandidatePosition = {
  candidateIndex: number;
  candidateCount: number;
};

export function getNextImportCycleMatch<T>(
  state: ReaderImportCycleState,
  resultsByAttempt: T[][],
): ReaderImportCycleMatch<T> | null {
  const rawAttempt = Math.max(0, state.attemptCursor ?? 0);
  const startAttempt = rawAttempt >= resultsByAttempt.length && state.hasMatched ? 0 : clampIndex(rawAttempt, resultsByAttempt.length);
  const startResult = Math.max(0, state.resultCursor ?? 0);
  const ranges = state.hasMatched
    ? [
        { from: startAttempt, to: resultsByAttempt.length, initialResult: startResult },
        { from: 0, to: startAttempt + 1, initialResult: 0 },
      ]
    : [{ from: startAttempt, to: resultsByAttempt.length, initialResult: startResult }];

  for (const range of ranges) {
    for (let attemptIndex = range.from; attemptIndex < range.to; attemptIndex += 1) {
      const results = resultsByAttempt[attemptIndex] ?? [];
      const resultIndex = attemptIndex === startAttempt ? range.initialResult : 0;
      if (resultIndex >= results.length) continue;
      const nextResultIndex = resultIndex + 1;
      return {
        attemptIndex,
        resultIndex,
        result: results[resultIndex]!,
        nextAttemptCursor: nextResultIndex < results.length ? attemptIndex : attemptIndex + 1,
        nextResultCursor: nextResultIndex < results.length ? nextResultIndex : 0,
        hasMatched: true,
      };
    }
  }

  return null;
}

export function getImportCycleCandidatePosition<T>(
  match: Pick<ReaderImportCycleMatch<T>, "attemptIndex" | "resultIndex">,
  resultsByAttempt: T[][],
): ReaderImportCandidatePosition | null {
  const candidateCount = resultsByAttempt.reduce((total, results) => total + results.length, 0);
  if (candidateCount <= 1) return null;
  const previousCount = resultsByAttempt
    .slice(0, match.attemptIndex)
    .reduce((total, results) => total + results.length, 0);
  return {
    candidateIndex: previousCount + match.resultIndex + 1,
    candidateCount,
  };
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(0, index), length - 1);
}
