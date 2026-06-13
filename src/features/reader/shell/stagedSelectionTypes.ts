import type { ReaderSelection } from "../domain/types";

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
  note?: string;
  color?: string;
  source?: StagedSelectionSource;
  toolbarPosition?: StagedSelectionToolbarPosition;
};

export type StagedSelectionHandle = {
  stageSelectionFromCfiRange(input: ProgrammaticStagedSelectionInput): void;
  cancelStagedSelection(): void;
};

export type StagedSelectionCommitInput = {
  selection: ReaderSelection;
  color: string;
  note?: string;
};
