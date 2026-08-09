import type {
  ReaderCfiDisplayResult,
  ReaderCfiProbeResult,
  ReaderLocationDescription,
  ReaderSearchOptions,
  ReaderSearchResult,
  ReaderSelection,
} from "./types";

export type ReaderDescribeCfiHandle = (cfi: string) => Promise<ReaderLocationDescription>;
export type ReaderProbeCfiHandle = (cfi: string) => Promise<ReaderCfiProbeResult>;
export type ReaderDisplayCfiHandle = (
  cfi: string,
  options?: { navigationIntent?: StagedSelectionNavigationIntent },
) => Promise<ReaderCfiDisplayResult>;
export type ReaderSearchBookHandle = (
  query: string,
  options?: ReaderSearchOptions,
) => Promise<ReaderSearchResult[]>;

export type StagedSelectionNavigationIntent = "unrelated" | "import-staging" | "layout-reflow";

export type StagedSelectionSource =
  | { kind: "user-selection" }
  | {
      kind: "import";
      importJobId: string;
      importRowId: string;
    };

export type StagedSelectionToolbarPosition = {
  left: number;
  top: number;
  placement: "above" | "below";
};

export type ProgrammaticStagedSelectionInput = {
  cfiRange: string;
  text: string;
  quotePrefix?: string;
  quoteSuffix?: string;
  note?: string;
  color?: string;
  source?: StagedSelectionSource;
  toolbarPosition?: StagedSelectionToolbarPosition;
};

export type StagedSelectionHandle = {
  stageSelectionFromCfiRange(input: ProgrammaticStagedSelectionInput): Promise<void>;
  runStagingTransaction<T>(operation: () => Promise<T>): Promise<T>;
  cancelStagedSelection(): void;
};

export type StagedSelectionCommitInput = {
  selection: ReaderSelection;
  color: string;
  note?: string;
};
