export type StagedSelectionNavigationIntent = "unrelated" | "import-staging" | "layout-reflow";

export class StagedSelectionLifecycle {
  private activeNavigationCount = 0;

  constructor(private readonly actions: {
    cancelStagedSelection: () => void;
    onUnrelatedNavigation: () => void;
  }) {}

  async runNavigation<T>(intent: StagedSelectionNavigationIntent, operation: () => Promise<T>): Promise<T> {
    if (intent === "unrelated") this.cancelForUnrelatedNavigation();
    this.activeNavigationCount += 1;
    try {
      return await operation();
    } finally {
      this.activeNavigationCount -= 1;
    }
  }

  handleLocationChanged(): void {
    if (this.activeNavigationCount > 0) return;
    this.cancelForUnrelatedNavigation();
  }

  private cancelForUnrelatedNavigation(): void {
    this.actions.cancelStagedSelection();
    this.actions.onUnrelatedNavigation();
  }
}
