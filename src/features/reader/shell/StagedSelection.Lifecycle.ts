import type { StagedSelectionNavigationIntent } from "../domain/ReaderBridge.Types";
import {
  debugStagedSelection,
  previewStagedSelectionCfi,
} from "./StagedSelectionDebug.Diagnostics";

export class StagedSelectionLifecycle {
  private activeNavigationCount = 0;
  private protectedNavigationDepth = 0;
  private navigationEpoch = 0;
  private activeProtectedEpoch: number | null = null;
  private protectedOperationEpoch: number | null = null;

  constructor(private readonly actions: {
    cancelStagedSelection: () => void;
    onUnrelatedNavigation: () => void;
  }) {}

  async runNavigation<T>(intent: StagedSelectionNavigationIntent, operation: () => Promise<T>): Promise<T> {
    const protectsTrailingRelocation = intent !== "unrelated";
    let protectedEpoch: number | null = null;

    debugStagedSelection("navigation begin", {
      intent,
      activeNavigationCount: this.activeNavigationCount,
      protectedNavigationDepth: this.protectedNavigationDepth,
      navigationEpoch: this.navigationEpoch,
      protectedOperationEpoch: this.protectedOperationEpoch,
    });

    if (intent === "unrelated") {
      this.navigationEpoch += 1;
      const invalidatedEpoch = this.protectedOperationEpoch;
      this.protectedOperationEpoch = null;
      debugStagedSelection("protection invalidated by explicit navigation", {
        navigationEpoch: this.navigationEpoch,
        invalidatedEpoch,
      });
      this.cancelForUnrelatedNavigation("unrelated-navigation-start");
    } else {
      if (this.protectedNavigationDepth === 0) {
        this.navigationEpoch += 1;
        this.activeProtectedEpoch = this.navigationEpoch;
        this.protectedOperationEpoch = this.activeProtectedEpoch;
        debugStagedSelection("operation-owned relocation protection armed", {
          intent,
          protectedEpoch: this.activeProtectedEpoch,
        });
      }
      this.protectedNavigationDepth += 1;
      protectedEpoch = this.activeProtectedEpoch;
    }

    this.activeNavigationCount += 1;
    try {
      return await operation();
    } finally {
      this.activeNavigationCount -= 1;
      if (protectsTrailingRelocation) {
        this.protectedNavigationDepth -= 1;
        if (this.protectedNavigationDepth === 0) {
          if (protectedEpoch !== null && this.navigationEpoch === protectedEpoch) {
            this.protectedOperationEpoch = protectedEpoch;
            debugStagedSelection("operation-owned relocation protection retained", {
              intent,
              protectedEpoch,
            });
          }
          this.activeProtectedEpoch = null;
        }
      }
      debugStagedSelection("navigation end", {
        intent,
        activeNavigationCount: this.activeNavigationCount,
        protectedNavigationDepth: this.protectedNavigationDepth,
        navigationEpoch: this.navigationEpoch,
        protectedOperationEpoch: this.protectedOperationEpoch,
      });
    }
  }

  handleLocationChanged(cfi?: string): void {
    if (this.activeNavigationCount > 0) {
      debugStagedSelection("relocation preserved during active navigation", {
        cfiPreview: previewStagedSelectionCfi(cfi),
        activeNavigationCount: this.activeNavigationCount,
        navigationEpoch: this.navigationEpoch,
      });
      return;
    }
    if (this.protectedOperationEpoch !== null) {
      debugStagedSelection("relocation preserved by protected operation", {
        cfiPreview: previewStagedSelectionCfi(cfi),
        protectedEpoch: this.protectedOperationEpoch,
      });
      return;
    }
    debugStagedSelection("unprotected relocation cancels staging", {
      cfiPreview: previewStagedSelectionCfi(cfi),
      navigationEpoch: this.navigationEpoch,
    });
    this.cancelForUnrelatedNavigation("unprotected-relocation");
  }

  private cancelForUnrelatedNavigation(reason: string): void {
    debugStagedSelection("staged cancellation requested", { reason });
    this.actions.cancelStagedSelection();
    this.actions.onUnrelatedNavigation();
  }
}
