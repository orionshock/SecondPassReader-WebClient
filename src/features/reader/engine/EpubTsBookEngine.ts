// Placeholder: future epub-ts engine adapter.
//
// This layer will own the concrete @likecoin/epub-ts lifecycle and expose only
// engine-agnostic facts upward through the ReadingShell boundary.
//
// Intentionally does not implement rendering in this pass.

export type EpubTsBookEngine = {
  dispose(): void;
};

